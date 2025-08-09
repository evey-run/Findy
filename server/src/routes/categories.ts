import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/categories - Récupérer toutes les catégories
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    
    const categories = await prisma.category.findMany({
      where: type ? { type: type as any } : undefined,
      include: {
        keywords: { select: { value: true } },
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const mapped = categories.map((c: any) => ({
      ...c,
      keywords: (c.keywords || []).map((k: any) => k.value)
    }));
    res.json(mapped);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/categories/:id - Récupérer une catégorie par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        keywords: { select: { value: true } },
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      }
    });
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    const mapped: any = category ? { ...category, keywords: (category as any).keywords.map((k: any) => k.value) } : null;
    res.json(mapped);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST /api/categories - Créer une nouvelle catégorie
router.post('/', async (req, res) => {
  try {
    const { name, type, color, icon, keywords } = req.body as { name: string; type: string; color?: string; icon?: string | null; keywords?: string[] };
    console.log('📝 POST /api/categories - payload keywords:', keywords);
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }
    
    if (!['INCOME', 'EXPENSE', 'FIXED'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' });
    }
    
    const category = await prisma.category.create({
      data: {
        name,
        type,
        color: color || '#6b7280',
        icon: icon || undefined
      }
    });

    const kws = Array.isArray(keywords) ? keywords.filter(Boolean).map(v => v.trim()).filter(v => v.length > 0) : [];
    if (kws.length > 0) {
      const result = await prisma.categoryKeyword.createMany({
        data: kws.map((value) => ({ value, categoryId: category.id })),
        skipDuplicates: true
      });
      console.log(`📝 POST /api/categories - keywords persisted: ${result.count}`);
    }

    const withKeywords = await prisma.category.findUnique({
      where: { id: category.id },
      include: { keywords: { select: { value: true } }, _count: { select: { transactions: true, budgets: true, recurrences: true } } }
    });

    const mapped: any = withKeywords ? { ...withKeywords, keywords: (withKeywords as any).keywords.map((k: any) => k.value) } : null;
    res.status(201).json(mapped);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Mettre à jour une catégorie
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, color, icon, keywords } = req.body as { name?: string; type?: string; color?: string; icon?: string | null; keywords?: string[] };
    console.log('📝 PUT /api/categories/:id - payload keywords:', keywords);
    
    if (type && !['INCOME', 'EXPENSE', 'FIXED'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' });
    }

    // Update category basic fields
    await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(icon !== undefined ? { icon } : {})
      }
    });

    // Update keywords if provided
    if (keywords !== undefined) {
      const kws = Array.isArray(keywords) ? keywords.filter(Boolean).map(v => v.trim()).filter(v => v.length > 0) : [];
      console.log('📝 PUT /api/categories/:id - normalized keywords:', kws);
      const operations: any[] = [];
      operations.push(prisma.categoryKeyword.deleteMany({ where: { categoryId: id } }));
      if (kws.length > 0) {
        operations.push(prisma.categoryKeyword.createMany({ data: kws.map((value) => ({ value, categoryId: id })), skipDuplicates: true }));
      }
      const txResult = await prisma.$transaction(operations);
      console.log('📝 PUT /api/categories/:id - keywords updated, ops:', txResult.length);
    }

    const updated = await prisma.category.findUnique({
      where: { id },
      include: { keywords: { select: { value: true } }, _count: { select: { transactions: true, budgets: true, recurrences: true } } }
    });

    if (!updated) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const mapped: any = { ...updated, keywords: (updated as any).keywords.map((k: any) => k.value) };
    res.json(mapped);
  } catch (error: any) {
    console.error('Error updating category:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Supprimer une catégorie
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier si la catégorie est utilisée
    const count = await prisma.category.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      }
    });
    
    if (count && (count._count.transactions > 0 || count._count.budgets > 0 || count._count.recurrences > 0)) {
      return res.status(400).json({ 
        error: 'Cannot delete category that is being used in transactions, budgets, or recurrences' 
      });
    }
    
    await prisma.category.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting category:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// POST /api/categories/:id/apply-keywords - Assigner en masse cette catégorie aux transactions existantes qui matchent ses mots-clés
router.post('/:id/apply-keywords', async (req, res) => {
  try {
    const { id } = req.params;
    const { includeAlreadyCategorized } = req.body as { includeAlreadyCategorized?: boolean };

    // Récupérer la catégorie et ses mots-clés
    const category = await prisma.category.findUnique({
      where: { id },
      include: { keywords: { select: { value: true } } }
    });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    const kws = (category.keywords || [])
      .map(k => (k.value || '').toLowerCase().trim())
      .filter(Boolean);
    if (kws.length === 0) {
      return res.status(400).json({ error: 'No keywords defined for this category' });
    }

    // Récupérer les transactions cibles
    const txWhere: any = includeAlreadyCategorized ? {} : { categoryId: null };
    const candidates = await prisma.transaction.findMany({
      where: txWhere,
      select: { id: true, description: true, categoryId: true }
    });

    // Normalisation et filtrage côté serveur (insensible aux accents)
    const toAssign: string[] = [];
    for (const t of candidates) {
      const desc = (t.description || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const matched = kws.some(kw => {
        const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return desc.includes(kwNorm);
      });
      if (matched) {
        if (includeAlreadyCategorized || !t.categoryId) {
          toAssign.push(t.id);
        }
      }
    }

    if (toAssign.length === 0) {
      return res.json({ updatedCount: 0, updatedIds: [] });
    }

    // Mettre à jour en masse
    // SQLite ne supporte pas updateMany with where id in []? Prisma le gère via OR.
    // On itère pour rester sûr et journaliser.
    await prisma.$transaction(
      toAssign.map((tid) => prisma.transaction.update({ where: { id: tid }, data: { categoryId: id } }))
    );

    res.json({ updatedCount: toAssign.length, updatedIds: toAssign });
  } catch (error) {
    console.error('Error applying keywords to transactions:', error);
    res.status(500).json({ error: 'Failed to apply keywords to transactions' });
  }
});

export default router;
