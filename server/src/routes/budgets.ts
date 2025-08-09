import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/budgets - Récupérer tous les budgets
router.get('/', async (req, res) => {
  try {
    const { categoryId, shared } = req.query;
    
    const where: any = {};
    if (categoryId) where.categoryId = categoryId;
    if (shared !== undefined) where.shared = shared === 'true';
    
    const budgets = await prisma.budget.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// POST /api/budgets - Créer un nouveau budget
router.post('/', async (req, res) => {
  try {
    const { amount, period, startDate, shared, categoryId } = req.body;
    
    if (!amount || !categoryId) {
      return res.status(400).json({ 
        error: 'Amount and categoryId are required' 
      });
    }
    
    const budget = await prisma.budget.create({
      data: {
        amount: parseFloat(amount),
        period: period || 'MONTHLY',
        startDate: startDate ? new Date(startDate) : new Date(),
        shared: shared || false,
        categoryId
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    res.status(201).json(budget);
  } catch (error) {
    console.error('Error creating budget:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// PUT /api/budgets/:id - Mettre à jour un budget
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, period, startDate, shared } = req.body;
    
    const budget = await prisma.budget.update({
      where: { id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(period && { period }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(shared !== undefined && { shared })
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    res.json(budget);
  } catch (error: any) {
    console.error('Error updating budget:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// DELETE /api/budgets/:id - Supprimer un budget
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.budget.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting budget:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

export default router;
