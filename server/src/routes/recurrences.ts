import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/recurrences - Récupérer toutes les récurrences
router.get('/', async (req, res) => {
  try {
    const { userId, categoryId, active, shared } = req.query;
    
    const where: any = {};
    if (userId) where.userId = userId;
    if (categoryId) where.categoryId = categoryId;
    if (active !== undefined) where.active = active === 'true';
    if (shared !== undefined) where.shared = shared === 'true';
    
    const recurrences = await prisma.recurrence.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
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
        nextDue: 'asc'
      }
    });
    
    res.json(recurrences);
  } catch (error) {
    console.error('Error fetching recurrences:', error);
    res.status(500).json({ error: 'Failed to fetch recurrences' });
  }
});

// POST /api/recurrences - Créer une nouvelle récurrence
router.post('/', async (req, res) => {
  try {
    const { amount, frequency, nextDue, description, shared, userId, categoryId, active } = req.body;
    
    if (!amount || !nextDue || !description || !categoryId) {
      return res.status(400).json({ 
        error: 'Amount, nextDue, description, and categoryId are required' 
      });
    }
    
    const recurrence = await prisma.recurrence.create({
      data: {
        amount: parseFloat(amount),
        frequency: frequency || 'MONTHLY',
        nextDue: new Date(nextDue),
        description,
        shared: shared || false,
        active: active !== false,
        userId: userId || null,
        categoryId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
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
    
    res.status(201).json(recurrence);
  } catch (error) {
    console.error('Error creating recurrence:', error);
    res.status(500).json({ error: 'Failed to create recurrence' });
  }
});

// PUT /api/recurrences/:id - Mettre à jour une récurrence
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, frequency, nextDue, description, shared, active } = req.body;
    
    const recurrence = await prisma.recurrence.update({
      where: { id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(frequency && { frequency }),
        ...(nextDue && { nextDue: new Date(nextDue) }),
        ...(description && { description }),
        ...(shared !== undefined && { shared }),
        ...(active !== undefined && { active })
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
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
    
    res.json(recurrence);
  } catch (error: any) {
    console.error('Error updating recurrence:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Recurrence not found' });
    }
    res.status(500).json({ error: 'Failed to update recurrence' });
  }
});

// DELETE /api/recurrences/:id - Supprimer une récurrence
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.recurrence.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting recurrence:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Recurrence not found' });
    }
    res.status(500).json({ error: 'Failed to delete recurrence' });
  }
});

// POST /api/recurrences/:id/execute - Exécuter une récurrence (créer la transaction)
router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    
    const recurrence = await prisma.recurrence.findUnique({
      where: { id },
      include: { category: true }
    });
    
    if (!recurrence) {
      return res.status(404).json({ error: 'Recurrence not found' });
    }
    
    if (!recurrence.active) {
      return res.status(400).json({ error: 'Recurrence is not active' });
    }
    
    // Créer la transaction
    const transaction = await prisma.transaction.create({
      data: {
        amount: recurrence.amount,
        description: `${recurrence.description} (Récurrence automatique)`,
        date: new Date(),
        shared: recurrence.shared,
        userId: recurrence.userId!,
        categoryId: recurrence.categoryId
      }
    });
    
    // Calculer la prochaine échéance
    const nextDue = new Date(recurrence.nextDue);
    switch (recurrence.frequency) {
      case 'DAILY':
        nextDue.setDate(nextDue.getDate() + 1);
        break;
      case 'WEEKLY':
        nextDue.setDate(nextDue.getDate() + 7);
        break;
      case 'MONTHLY':
        nextDue.setMonth(nextDue.getMonth() + 1);
        break;
      case 'QUARTERLY':
        nextDue.setMonth(nextDue.getMonth() + 3);
        break;
      case 'YEARLY':
        nextDue.setFullYear(nextDue.getFullYear() + 1);
        break;
    }
    
    // Mettre à jour la récurrence
    const updatedRecurrence = await prisma.recurrence.update({
      where: { id },
      data: { nextDue },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            color: true
          }
        },
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
    
    res.json({
      recurrence: updatedRecurrence,
      transaction
    });
  } catch (error) {
    console.error('Error executing recurrence:', error);
    res.status(500).json({ error: 'Failed to execute recurrence' });
  }
});

export default router;
