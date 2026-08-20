import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prisma';
import { resolveScope, personalSpaceId } from '../lib/scope';

const router = express.Router();

// Récupérer tous les objectifs
router.get('/', async (req, res) => {
  try {
    // Portée : un objectif appartient à un espace. « Famille » = partagé,
    // l'espace perso = privé. Sans filtre, on renvoie tout (vue globale).
    const scope = await resolveScope(req.query as any, req.authUserId);
    const objectives = await prisma.objective.findMany({
      where: scope ? { spaceId: { in: scope } } : {},
      include: { space: { select: { id: true, name: true, kind: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(objectives);
  } catch (error) {
    console.error('Error fetching objectives:', error);
    res.status(500).json({ error: 'Failed to fetch objectives' });
  }
});

// Récupérer un objectif spécifique
router.get('/:id', async (req, res) => {
  try {
    const objective = await prisma.objective.findUnique({
      where: { id: req.params.id }
    });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }
    res.json(objective);
  } catch (error) {
    console.error('Error fetching objective:', error);
    res.status(500).json({ error: 'Failed to fetch objective' });
  }
});

// Récupérer la progression d'un objectif
router.get('/:id/progress', async (req, res) => {
  try {
    const objective = await prisma.objective.findUnique({
      where: { id: req.params.id }
    });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    // Récupérer les transactions liées à cet objectif
    // Nous cherchons des transactions dont la description contient le titre de l'objectif
    // ou des mots clés comme "économie" ou "épargne" suivis du titre
    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { description: { contains: objective.title } },
          { description: { contains: `economie ${objective.title}` } },
          { description: { contains: `économie ${objective.title}` } },
          { description: { contains: `epargne ${objective.title}` } },
          { description: { contains: `épargne ${objective.title}` } }
        ]
      },
      orderBy: { date: 'desc' }
    });

    // Calculer le montant total économisé
    const totalSaved = transactions.reduce((sum, transaction) => {
      // On ne compte que les transactions positives (dépôts)
      if (transaction.amount > 0) {
        return sum + transaction.amount;
      }
      return sum;
    }, 0);

    // Calculer le pourcentage de progression
    const percentage = Math.min(100, (totalSaved / objective.targetAmount) * 100);
    
    // Calculer le montant restant à économiser
    const remaining = Math.max(0, objective.targetAmount - totalSaved);
    
    // Déterminer si l'objectif est complété
    const isCompleted = percentage >= 100;

    // Récupérer les transactions récentes (3 dernières)
    const recentTransactions = transactions.slice(0, 3);

    // Retourner les informations de progression
    res.json({
      objective,
      transactions,
      totalSaved,
      remaining,
      percentage,
      isCompleted,
      searchPattern: `%${objective.title}%`,
      recentTransactions
    });
  } catch (error) {
    console.error('Error fetching objective progress:', error);
    res.status(500).json({ error: 'Failed to fetch objective progress' });
  }
});

// Créer un nouvel objectif
router.post('/', async (req, res) => {
  try {
    const { title, description, targetAmount, deadline, icon, spaceId, userId } = req.body;

    if (!title || !targetAmount) {
      return res.status(400).json({ error: 'Title and target amount are required' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const newObjective = await prisma.objective.create({
      data: {
        id,
        title,
        description: description || '',
        targetAmount: parseFloat(targetAmount),
        deadline: deadline ? new Date(deadline) : null,
        isCompleted: false,
        // L'espace suit le sélecteur actif ; à défaut l'espace personnel, pour
        // qu'un objectif ne devienne jamais partagé par accident.
        spaceId: spaceId || (userId ? await personalSpaceId(userId) : null),
        createdAt: new Date(now),
        updatedAt: new Date(now)
      }
    });
    res.status(201).json(newObjective);
  } catch (error) {
    console.error('Error creating objective:', error);
    res.status(500).json({ error: 'Failed to create objective' });
  }
});

// Mettre à jour un objectif
router.put('/:id', async (req, res) => {
  try {
    const { title, description, targetAmount, deadline, icon, spaceId } = req.body;
    const { id } = req.params;
    
    if (!title || !targetAmount) {
      return res.status(400).json({ error: 'Title and target amount are required' });
    }

    const objective = await prisma.objective.findUnique({
      where: { id }
    });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    const now = new Date().toISOString();

    const updatedObjective = await prisma.objective.update({
      where: { id },
      data: {
        title,
        description: description || '',
        targetAmount: parseFloat(targetAmount),
        deadline: deadline ? new Date(deadline) : null,
        // Déplacement d'espace = action « Partager / Rendre privé ».
        ...(spaceId !== undefined && { spaceId }),
        updatedAt: new Date(now)
      }
    });
    res.json(updatedObjective);
  } catch (error) {
    console.error('Error updating objective:', error);
    res.status(500).json({ error: 'Failed to update objective' });
  }
});

// Archiver / désarchiver un objectif
router.patch('/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    const objective = await prisma.objective.findUnique({ where: { id } });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    const updated = await prisma.objective.update({
      where: { id },
      data: { archived: !objective.archived, updatedAt: new Date() },
    });
    res.json(updated);
  } catch (error) {
    console.error('Error archiving objective:', error);
    res.status(500).json({ error: 'Failed to archive objective' });
  }
});

// Supprimer un objectif
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const objective = await prisma.objective.findUnique({
      where: { id }
    });
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }

    await prisma.objective.delete({
      where: { id }
    });
    res.json({ message: 'Objective deleted successfully' });
  } catch (error) {
    console.error('Error deleting objective:', error);
    res.status(500).json({ error: 'Failed to delete objective' });
  }
});

export default router;
