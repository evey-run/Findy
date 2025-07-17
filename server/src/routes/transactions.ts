import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/transactions - Récupérer toutes les transactions
router.get('/', async (req, res) => {
  try {
    const { bankId, categoryId, shared, startDate, endDate, limit, offset } = req.query;
    
    const where: any = {};
    
    if (bankId) where.bankId = bankId;
    if (categoryId) where.categoryId = categoryId;
    if (shared !== undefined) where.shared = shared === 'true';
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }
    
    // Forcer le rechargement - incluant image pour les banques
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            image: true,
            balance: true
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
        date: 'desc'
      },
      take: limit ? parseInt(limit as string) : undefined,
      skip: offset ? parseInt(offset as string) : undefined
    });
    
    // Debug: log the first transaction bank to see what fields are returned
    if (transactions.length > 0) {
      console.log('🔍 DEBUG - Premier bank d\'une transaction:', JSON.stringify(transactions[0].bank, null, 2));
    }
    
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// GET /api/transactions/stats/summary - Statistiques résumées
router.get('/stats/summary', async (req, res) => {
  try {
    const { bankId, startDate, endDate } = req.query;
    
    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }
    
    const [incomeSum, expenseSum, transactionCount] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...where, amount: { gt: 0 } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { ...where, amount: { lt: 0 } },
        _sum: { amount: true }
      }),
      prisma.transaction.count({ where })
    ]);
    
    const totalIncome = incomeSum._sum.amount || 0;
    const totalExpenses = Math.abs(expenseSum._sum.amount || 0);
    const balance = totalIncome - totalExpenses;
    
    res.json({
      totalIncome,
      totalExpenses,
      balance,
      transactionCount
    });
  } catch (error) {
    console.error('Error fetching transaction summary:', error);
    res.status(500).json({ error: 'Failed to fetch transaction summary' });
  }
});

// GET /api/transactions/:id - Récupérer une transaction par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await prisma.transaction.findUnique({
      where: { id },
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
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(transaction);
  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

// POST /api/transactions - Créer une nouvelle transaction
router.post('/', async (req, res) => {
  try {
    const { amount, description, date, shared, bankId, categoryId } = req.body;
    
    if (!amount || !description || !bankId) {
      return res.status(400).json({ 
        error: 'Amount, description, and bankId are required' 
      });
    }
    
    // Vérifier que la banque existe
    const bank = await prisma.bank.findUnique({ where: { id: bankId } });
    if (!bank) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    // Vérifier que la catégorie existe si elle est fournie
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }
    
    const transaction = await prisma.transaction.create({
      data: {
        amount: parseFloat(amount),
        description,
        date: date ? new Date(date) : new Date(),
        shared: shared || false,
        bankId,
        categoryId: categoryId || null
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
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id - Mettre à jour une transaction
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, date, shared, categoryId } = req.body;
    
    // Vérifier que la catégorie existe si elle est fournie
    if (categoryId) {
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }
    }
    
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(description && { description }),
        ...(date && { date: new Date(date) }),
        ...(shared !== undefined && { shared }),
        ...(categoryId !== undefined && { categoryId })
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
    
    res.json(transaction);
  } catch (error: any) {
    console.error('Error updating transaction:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id - Supprimer une transaction
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.transaction.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

export default router;
