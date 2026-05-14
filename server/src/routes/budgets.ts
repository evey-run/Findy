import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validate } from '../middlewares/validate';
import { IdParam } from '../schemas/common';
import { ListBudgetsQuery, CreateBudgetBody, UpdateBudgetBody } from '../schemas/budgets';
import type { z } from 'zod';

const router = express.Router();

const CATEGORY_SELECT = { id: true, name: true, type: true, color: true, icon: true } as const;

// GET /api/budgets
router.get('/', validate({ query: ListBudgetsQuery }), async (req, res) => {
  try {
    const { categoryId, shared } = req.query as unknown as z.infer<typeof ListBudgetsQuery>;
    const where: Prisma.BudgetWhereInput = {};
    if (categoryId) where.categoryId = categoryId;
    if (shared !== undefined) where.shared = shared;

    const budgets = await prisma.budget.findMany({
      where,
      include: { category: { select: CATEGORY_SELECT } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(budgets);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching budgets');
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// POST /api/budgets
router.post('/', validate({ body: CreateBudgetBody }), async (req, res) => {
  try {
    const body = req.body as z.infer<typeof CreateBudgetBody>;

    const budget = await prisma.budget.create({
      data: {
        amount: body.amount,
        period: body.period ?? 'MONTHLY',
        startDate: body.startDate ? new Date(body.startDate) : new Date(),
        shared: body.shared ?? false,
        categoryId: body.categoryId,
        bankId: body.bankId ?? null,
      },
      include: { category: { select: CATEGORY_SELECT } },
    });

    res.status(201).json(budget);
  } catch (error) {
    logger.error({ err: error }, 'Error creating budget');
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// PUT /api/budgets/:id
router.put('/:id', validate({ params: IdParam, body: UpdateBudgetBody }), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as z.infer<typeof UpdateBudgetBody>;

    const budget = await prisma.budget.update({
      where: { id },
      data: {
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.period !== undefined ? { period: body.period } : {}),
        ...(body.startDate !== undefined ? { startDate: new Date(body.startDate) } : {}),
        ...(body.shared !== undefined ? { shared: body.shared } : {}),
        ...(body.bankId !== undefined ? { bankId: body.bankId } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
      },
      include: { category: { select: CATEGORY_SELECT } },
    });

    res.json(budget);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    logger.error({ err: error }, 'Error updating budget');
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// DELETE /api/budgets/:id
router.delete('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    await prisma.budget.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    logger.error({ err: error }, 'Error deleting budget');
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

export default router;
