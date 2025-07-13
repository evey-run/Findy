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
    
    res.json(categories);
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
    
    res.json(category);
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// POST /api/categories - Créer une nouvelle catégorie
router.post('/', async (req, res) => {
  try {
    const { name, type, color, icon } = req.body;
    
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
        icon
      }
    });
    
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Mettre à jour une catégorie
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, color, icon } = req.body;
    
    if (type && !['INCOME', 'EXPENSE', 'FIXED'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' });
    }
    
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(color && { color }),
        ...(icon !== undefined && { icon })
      }
    });
    
    res.json(category);
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

export default router;
