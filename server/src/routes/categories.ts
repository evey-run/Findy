import express from 'express';
import prisma from '../prisma';

const router = express.Router();

// GET /api/categories - Récupérer toutes les catégories
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    
    const categories = await prisma.category.findMany({
      where: type ? { type: type as any } : undefined,
      include: {
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
      keywords: [] // Pas de keywords disponibles dans le schéma actuel
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
    
    // Ajouter un tableau vide pour keywords pour compatibilité avec le frontend
    const mapped: any = category ? { ...category, keywords: [] } : null;
    res.json(mapped);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST /api/categories - Créer une nouvelle catégorie
router.post('/', async (req, res) => {
  try {
    const { name, type, color, icon } = req.body as { name: string; type: string; color?: string; icon?: string | null };
    console.log('📝 POST /api/categories - new category');
    
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

    // Fonctionnalité keywords désactivée - schéma non disponible
    console.log(`📝 POST /api/categories - keywords functionality disabled`);

    const withKeywords = await prisma.category.findUnique({
      where: { id: category.id },
      include: { _count: { select: { transactions: true, budgets: true, recurrences: true } } }
    });

    const mapped: any = withKeywords ? { ...withKeywords, keywords: [] } : null;
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

    // Build transactional operations: update fields, then replace keywords (if provided)
    const operations: any[] = [
      prisma.category.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(icon !== undefined ? { icon } : {})
        }
      })
    ];

    const txResult = await prisma.$transaction(operations);
    console.log('📝 PUT /api/categories/:id - ops:', txResult.length);

    const updated = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { transactions: true, budgets: true, recurrences: true } } }
    });

    if (!updated) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const mapped: any = { ...updated, keywords: [] };
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

    // Récupérer la catégorie
    const category = await prisma.category.findUnique({
      where: { id }
    });
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Fonctionnalité keywords désactivée - schéma non disponible
    return res.status(400).json({ error: 'Keywords functionality is not available in the current schema' });
  } catch (error) {
    console.error('Error applying keywords to transactions:', error);
    res.status(500).json({ error: 'Failed to apply keywords to transactions' });
  }
});

export default router;
