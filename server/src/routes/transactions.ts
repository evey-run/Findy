import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validate } from '../middlewares/validate';
import { IdParam } from '../schemas/common';
import {
  ListTransactionsQuery,
  StatsSummaryQuery,
  CreateTransactionBody,
  UpdateTransactionBody,
  BulkUpdateBody,
  SearchTransactionsBody,
} from '../schemas/transactions';
import type { z } from 'zod';

const router = express.Router();

const BANK_SELECT = { id: true, name: true, shortName: true, color: true, image: true, balance: true } as const;
const CATEGORY_SELECT = { id: true, name: true, type: true, color: true, icon: true } as const;

// GET /api/transactions
router.get('/', validate({ query: ListTransactionsQuery }), async (req, res) => {
  try {
    const q = req.query as unknown as z.infer<typeof ListTransactionsQuery>;
    const where: Prisma.TransactionWhereInput = {};

    if (q.bankId) where.bankId = q.bankId;
    if (q.accountType) where.bank = { accountType: q.accountType };
    if (q.categoryId && q.categoryId !== '' && q.categoryId !== 'undefined') {
      where.categoryId = q.categoryId;
    }
    if (q.startDate || q.endDate) {
      where.date = {};
      if (q.startDate) where.date.gte = q.startDate;
      if (q.endDate) where.date.lte = q.endDate;
    }
    if (q.search && q.search.trim() !== '') {
      const normalized = q.search.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      where.OR = [
        { description: { contains: q.search.trim() } },
        { description: { contains: normalized } },
      ];
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { bank: { select: BANK_SELECT }, category: { select: CATEGORY_SELECT } },
      orderBy: { date: 'desc' },
      take: q.limit,
      skip: q.offset,
    });

    res.json(transactions);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching transactions');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/stats/summary
router.get('/stats/summary', validate({ query: StatsSummaryQuery }), async (req, res) => {
  try {
    const q = req.query as unknown as z.infer<typeof StatsSummaryQuery>;
    const where: Prisma.TransactionWhereInput = {};
    if (q.bankId) where.bankId = q.bankId;
    if (q.startDate || q.endDate) {
      where.date = {};
      if (q.startDate) where.date.gte = q.startDate;
      if (q.endDate) where.date.lte = q.endDate;
    }

    const [incomeSum, expenseSum, transactionCount] = await Promise.all([
      prisma.transaction.aggregate({ where: { ...where, amount: { gt: 0 } }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { ...where, amount: { lt: 0 } }, _sum: { amount: true } }),
      prisma.transaction.count({ where }),
    ]);

    const totalIncome = incomeSum._sum.amount || 0;
    const totalExpenses = Math.abs(expenseSum._sum.amount || 0);

    res.json({
      totalIncome,
      totalExpenses,
      balance: totalIncome - totalExpenses,
      transactionCount,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching transaction summary');
    res.status(500).json({ error: 'Failed to fetch transaction summary' });
  }
});

// GET /api/transactions/:id
router.get('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        bank: { select: { id: true, name: true, shortName: true, color: true, image: true } },
        category: { select: CATEGORY_SELECT },
      },
    });

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching transaction');
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// POST /api/transactions
router.post('/', validate({ body: CreateTransactionBody }), async (req, res) => {
  try {
    const body = req.body as z.infer<typeof CreateTransactionBody>;

    const bank = await prisma.bank.findUnique({ where: { id: body.bankId } });
    if (!bank) return res.status(404).json({ error: 'Bank not found' });

    if (body.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!category) return res.status(404).json({ error: 'Category not found' });
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount: body.amount,
        description: body.description,
        date: body.date ? new Date(body.date as string) : new Date(),
        bankId: body.bankId,
        categoryId: body.categoryId ?? null,
        unitPrice: body.unitPrice ?? null,
        quantity: body.quantity ?? null,
      },
      include: {
        bank: { select: { id: true, name: true, shortName: true, color: true, image: true } },
        category: { select: CATEGORY_SELECT },
      },
    });

    res.status(201).json(transaction);
  } catch (error) {
    logger.error({ err: error }, 'Error creating transaction');
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id
router.put('/:id', validate({ params: IdParam, body: UpdateTransactionBody }), async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body as z.infer<typeof UpdateTransactionBody>;

    if (body.bankId) {
      const bank = await prisma.bank.findUnique({ where: { id: body.bankId } });
      if (!bank) return res.status(404).json({ error: 'Bank not found' });
    }
    if (body.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
      if (!category) return res.status(404).json({ error: 'Category not found' });
    }

    const data: Prisma.TransactionUpdateInput = {};
    if (body.amount !== undefined) data.amount = body.amount;
    if (body.description !== undefined) data.description = body.description;
    if (body.date !== undefined) data.date = new Date(body.date as string);
    if (body.categoryId !== undefined) {
      data.category = body.categoryId ? { connect: { id: body.categoryId } } : { disconnect: true };
    }
    if (body.bankId !== undefined) data.bank = { connect: { id: body.bankId } };
    if (body.unitPrice !== undefined) data.unitPrice = body.unitPrice;
    if (body.quantity !== undefined) data.quantity = body.quantity;

    const transaction = await prisma.transaction.update({
      where: { id },
      data,
      include: {
        bank: { select: { id: true, name: true, shortName: true, color: true, image: true } },
        category: { select: CATEGORY_SELECT },
      },
    });

    res.json(transaction);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    logger.error({ err: error }, 'Error updating transaction');
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id
router.delete('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    await prisma.transaction.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    logger.error({ err: error }, 'Error deleting transaction');
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

// POST /api/transactions/bulk-update
router.post('/bulk-update', validate({ body: BulkUpdateBody }), async (req, res) => {
  try {
    const { filters, actions } = req.body as z.infer<typeof BulkUpdateBody>;

    const where: Prisma.TransactionWhereInput = {};
    if (filters.bankId) where.bankId = filters.bankId;
    if (filters.categoryId) {
      where.categoryId = filters.categoryId === 'undefined' ? null : filters.categoryId;
    }
    if (filters.checked === 'true' || filters.checked === 'false') {
      where.checked = filters.checked === 'true';
    }
    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) {
        const sd = new Date(filters.startDate);
        if (!Number.isNaN(sd.getTime())) where.date.gte = sd;
      }
      if (filters.endDate) {
        const ed = new Date(filters.endDate);
        if (!Number.isNaN(ed.getTime())) where.date.lte = ed;
      }
      if (Object.keys(where.date).length === 0) delete where.date;
    }
    if (filters.searchText && filters.searchText.trim() !== '') {
      where.description = { contains: filters.searchText.trim() };
    }

    const data: Prisma.TransactionUncheckedUpdateManyInput = {};
    if (actions.changeCategory?.enabled) {
      const catId = actions.changeCategory.categoryId;
      if (!catId || catId === 'undefined' || catId === '') {
        data.categoryId = null;
      } else {
        const cat = await prisma.category.findUnique({ where: { id: catId } });
        if (!cat) return res.status(400).json({ error: 'Invalid categoryId for changeCategory' });
        data.categoryId = catId;
      }
    }
    if (actions.changeChecked?.enabled && typeof actions.changeChecked.checked === 'boolean') {
      data.checked = actions.changeChecked.checked;
    }
    if (actions.changeBank?.enabled && actions.changeBank.bankId) {
      const bId = actions.changeBank.bankId;
      const bank = await prisma.bank.findUnique({ where: { id: bId } });
      if (!bank) return res.status(400).json({ error: 'Invalid bankId for changeBank' });
      data.bankId = bId;
    }

    const doReplace = actions.replaceText?.enabled;
    const replaceAll = !!actions.replaceText?.replaceAll;
    const replaceFrom = actions.replaceText?.from || '';
    const replaceTo = actions.replaceText?.to || '';

    const matchedCount = await prisma.transaction.count({ where });
    if (matchedCount === 0) {
      return res.json({ matchedCount: 0, updatedCount: 0 });
    }

    let updatedCount = 0;
    if (doReplace) {
      if (replaceAll) {
        const result = await prisma.transaction.updateMany({
          where,
          data: { ...data, ...(replaceTo !== undefined ? { description: replaceTo } : {}) },
        });
        updatedCount = result.count;
      } else {
        const items = await prisma.transaction.findMany({ where, select: { id: true, description: true } });
        for (const it of items) {
          const current = it.description || '';
          if (!replaceFrom) continue;
          const newDesc = current.replace(
            new RegExp(replaceFrom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
            replaceTo,
          );
          const dataPerItem: Prisma.TransactionUpdateInput = { ...data };
          if (newDesc !== current) dataPerItem.description = newDesc;
          if (Object.keys(dataPerItem).length === 0) continue;
          await prisma.transaction.update({ where: { id: it.id }, data: dataPerItem });
          updatedCount += 1;
        }
      }
    } else {
      if (Object.keys(data).length === 0) {
        return res.json({ matchedCount, updatedCount: 0 });
      }
      const result = await prisma.transaction.updateMany({ where, data });
      updatedCount = result.count;
    }

    return res.json({ matchedCount, updatedCount });
  } catch (error) {
    logger.error({ err: error }, 'Error in bulk-update');
    return res.status(500).json({ error: 'Failed to perform bulk update' });
  }
});

// POST /api/transactions/search
router.post('/search', validate({ body: SearchTransactionsBody }), async (req, res) => {
  try {
    const f = req.body as z.infer<typeof SearchTransactionsBody>;
    const where: Prisma.TransactionWhereInput = {};
    if (f.bankId) where.bankId = f.bankId;
    if (f.categoryId) {
      where.categoryId = f.categoryId === 'undefined' ? null : f.categoryId;
    }
    if (f.checked === 'true' || f.checked === 'false') where.checked = f.checked === 'true';
    if (f.startDate || f.endDate) {
      where.date = {};
      if (f.startDate) {
        const sd = new Date(f.startDate);
        if (!Number.isNaN(sd.getTime())) where.date.gte = sd;
      }
      if (f.endDate) {
        const ed = new Date(f.endDate);
        if (!Number.isNaN(ed.getTime())) where.date.lte = ed;
      }
      if (Object.keys(where.date).length === 0) delete where.date;
    }
    if (f.searchText && f.searchText.trim() !== '') {
      where.description = { contains: f.searchText.trim() };
    }

    const [transactions, count] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: { bank: { select: BANK_SELECT }, category: { select: CATEGORY_SELECT } },
        orderBy: { date: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    return res.json({ count, transactions });
  } catch (error) {
    logger.error({ err: error }, 'Error in /transactions/search');
    return res.status(500).json({ error: 'Failed to search transactions' });
  }
});

export default router;
