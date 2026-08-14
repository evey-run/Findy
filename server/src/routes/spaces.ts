import express from 'express';
import prisma from '../prisma';

const router = express.Router();

const withMembers = {
  members: { include: { user: { select: { id: true, name: true, avatar: true } } } }
} as const;

function shape(space: any) {
  return {
    id: space.id,
    name: space.name,
    kind: space.kind,
    color: space.color,
    members: space.members.map((m: any) => m.user),
    memberIds: space.members.map((m: any) => m.userId)
  };
}

// GET /api/spaces?userId=X — les espaces visibles par un utilisateur
// (sans userId : tous les espaces, pour l'écran de gestion)
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query as { userId?: string };
    const spaces = await prisma.space.findMany({
      where: userId ? { members: { some: { userId } } } : undefined,
      include: withMembers,
      // Perso d'abord, puis les partagés, dans l'ordre de création.
      orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }]
    });
    res.json(spaces.map(shape));
  } catch (error) {
    console.error('Error fetching spaces:', error);
    res.status(500).json({ error: 'Failed to fetch spaces' });
  }
});

// POST /api/spaces { name, memberIds[] } — créer un espace partagé
router.post('/', async (req, res) => {
  try {
    const { name, memberIds } = req.body ?? {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    const unique = [...new Set<string>(memberIds ?? [])];
    // Un groupe n'a de sens qu'à plusieurs : l'espace personnel de chacun existe
    // déjà, on ne le recrée pas sous un autre nom.
    if (!Array.isArray(memberIds) || unique.length < 2) {
      return res.status(400).json({ error: 'Un groupe demande au moins deux membres' });
    }
    const found = await prisma.user.count({ where: { id: { in: unique } } });
    if (found !== unique.length) return res.status(400).json({ error: 'Membre inconnu' });

    const space = await prisma.space.create({
      data: {
        name: name.trim(),
        kind: 'SHARED',
        members: { create: unique.map((userId) => ({ userId })) }
      },
      include: withMembers
    });

    res.status(201).json(shape(space));
  } catch (error) {
    console.error('Error creating space:', error);
    res.status(500).json({ error: 'Failed to create space' });
  }
});

// PUT /api/spaces/:id { name?, memberIds? }
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, memberIds } = req.body ?? {};

    const space = await prisma.space.findUnique({ where: { id } });
    if (!space) return res.status(404).json({ error: 'Espace introuvable' });

    if (Array.isArray(memberIds)) {
      const unique = [...new Set<string>(memberIds)];
      const min = space.kind === 'SHARED' ? 2 : 1;
      if (unique.length < min) {
        return res.status(400).json({ error: `Cet espace demande au moins ${min} membre(s)` });
      }
      await prisma.$transaction([
        prisma.spaceMember.deleteMany({ where: { spaceId: id } }),
        prisma.spaceMember.createMany({ data: unique.map((userId) => ({ spaceId: id, userId })) })
      ]);
    }

    const updated = await prisma.space.update({
      where: { id },
      data: { ...(name !== undefined && { name: String(name).trim() }) },
      include: withMembers
    });

    res.json(shape(updated));
  } catch (error) {
    console.error('Error updating space:', error);
    res.status(500).json({ error: 'Failed to update space' });
  }
});

// DELETE /api/spaces/:id — refusé si l'espace contient encore des données,
// pour éviter de faire disparaître silencieusement des comptes ou des objectifs.
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [banks, objectives, budgets, categories] = await Promise.all([
      prisma.bank.count({ where: { spaceId: id } }),
      prisma.objective.count({ where: { spaceId: id } }),
      prisma.budget.count({ where: { spaceId: id } }),
      prisma.category.count({ where: { spaceId: id } })
    ]);

    const total = banks + objectives + budgets + categories;
    if (total > 0) {
      return res.status(409).json({
        error: `Cet espace contient encore ${banks} compte(s), ${objectives} objectif(s), ${budgets} budget(s) et ${categories} catégorie(s). Déplacez-les avant de le supprimer.`
      });
    }

    await prisma.space.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting space:', error);
    res.status(500).json({ error: 'Failed to delete space' });
  }
});

export default router;
