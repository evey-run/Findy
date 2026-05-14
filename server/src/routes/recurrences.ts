import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validate } from '../middlewares/validate';
import { IdParam } from '../schemas/common';
import {
  ListRecurrencesQuery,
  CreateRecurrenceBody,
  UpdateRecurrenceBody,
} from '../schemas/recurrences';
import type { z } from 'zod';

const router = express.Router();

// GET /api/recurrences
router.get('/', validate({ query: ListRecurrencesQuery }), async (req, res) => {
  try {
    const { bankId, categoryId, active } = req.query as unknown as z.infer<typeof ListRecurrencesQuery>;
    const where: Prisma.RecurrenceWhereInput = {};
    if (bankId) where.bankId = bankId;
    if (categoryId) where.categoryId = categoryId;
    if (active !== undefined) where.active = active;
    
    const recurrences = await prisma.recurrence.findMany({
      where,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
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
    logger.error({ err: error }, 'Error fetching recurrences');
    res.status(500).json({ error: 'Failed to fetch recurrences' });
  }
});

// POST /api/recurrences
router.post('/', validate({ body: CreateRecurrenceBody }), async (req, res) => {
  try {
    const body = req.body as z.infer<typeof CreateRecurrenceBody>;

    const recurrence = await prisma.recurrence.create({
      data: {
        amount: body.amount,
        frequency: body.frequency ?? 'MONTHLY',
        nextDue: new Date(body.nextDue),
        description: body.description,
        active: body.active !== false,
        bankId: body.bankId ?? null,
        categoryId: body.categoryId,
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
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
    logger.error({ err: error }, 'Error creating recurrence');
    res.status(500).json({ error: 'Failed to create recurrence' });
  }
});

// PUT /api/recurrences/:id
router.put('/:id', validate({ params: IdParam, body: UpdateRecurrenceBody }), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as z.infer<typeof UpdateRecurrenceBody>;

    const recurrence = await prisma.recurrence.update({
      where: { id },
      data: {
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.frequency !== undefined ? { frequency: body.frequency } : {}),
        ...(body.nextDue !== undefined ? { nextDue: new Date(body.nextDue) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(body.bankId !== undefined ? { bankId: body.bankId } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
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
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Recurrence not found' });
    }
    logger.error({ err: error }, 'Error updating recurrence');
    res.status(500).json({ error: 'Failed to update recurrence' });
  }
});

// DELETE /api/recurrences/:id
router.delete('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    await prisma.recurrence.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Recurrence not found' });
    }
    logger.error({ err: error }, 'Error deleting recurrence');
    res.status(500).json({ error: 'Failed to delete recurrence' });
  }
});

// POST /api/recurrences/:id/execute
router.post('/:id/execute', validate({ params: IdParam }), async (req, res) => {
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
        description: `${recurrence.description} 🔄`,
        date: new Date(),
        bankId: recurrence.bankId!,
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
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
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
    logger.error({ err: error }, 'Error executing recurrence');
    res.status(500).json({ error: 'Failed to execute recurrence' });
  }
});

// POST /api/recurrences/process - Traiter automatiquement les récurrences dues aujourd'hui
router.post('/process', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    
    // Récupérer toutes les récurrences dues aujourd'hui
    const dueRecurrences = await prisma.recurrence.findMany({
      where: {
        active: true,
        nextDue: {
          gte: today,
          lt: tomorrow
        }
      },
      include: {
        category: true,
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true
          }
        }
      }
    });
    
    const results: Array<{ recurrence: unknown; transaction: unknown; success: boolean; error?: string }> = [];
    
    for (const recurrence of dueRecurrences) {
      try {
        // Vérifier que la récurrence a une banque associée
        if (!recurrence.bankId) {
          logger.warn(`Skipping recurrence ${recurrence.id} - no bank associated`);
          continue;
        }
        
        // Créer la transaction
        const transaction = await prisma.transaction.create({
          data: {
            amount: recurrence.amount,
            description: `${recurrence.description} 🔄`,
            date: new Date(),
            bankId: recurrence.bankId,
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
          where: { id: recurrence.id },
          data: { nextDue },
          include: {
            bank: {
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
        
        results.push({
          recurrence: updatedRecurrence,
          transaction,
          success: true
        });
      } catch (error) {
        logger.error({ err: error }, `Error processing recurrence ${recurrence.id}:`);
        results.push({
          recurrence,
          transaction: null,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    res.json({
      processed: results.length,
      success: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    logger.error({ err: error }, 'Error processing recurrences');
    res.status(500).json({ error: 'Failed to process recurrences' });
  }
});

export default router;
