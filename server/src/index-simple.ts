import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// API Routes simples pour tester
app.get('/api/banks', async (req, res) => {
  try {
    const banks = await prisma.bank.findMany({
      select: {
        id: true,
        name: true,
        shortName: true,
        color: true,
        iban: true,
        balance: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    res.json(banks);
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const { bankId, categoryId, shared, startDate, endDate } = req.query;
    
    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (categoryId) where.categoryId = categoryId;
    if (shared !== undefined) where.shared = shared === 'true';
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }
    
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
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
      }
    });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/transactions - Créer une nouvelle transaction
app.post('/api/transactions', async (req, res) => {
  try {
    const { amount, description, date, shared, bankId, categoryId } = req.body;
    
    if (!amount || !description || !bankId || !categoryId) {
      return res.status(400).json({ 
        error: 'Amount, description, bankId, and categoryId are required' 
      });
    }
    
    const transaction = await prisma.transaction.create({
      data: {
        amount: parseFloat(amount),
        description,
        date: date ? new Date(date) : new Date(),
        shared: shared || false,
        bankId,
        categoryId
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
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
      }
    });
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id - Mettre à jour une transaction
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, date, shared, categoryId, bankId } = req.body;
    
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(description && { description }),
        ...(date && { date: new Date(date) }),
        ...(shared !== undefined && { shared }),
        ...(categoryId && { categoryId }),
        ...(bankId && { bankId })
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
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
app.delete('/api/transactions/:id', async (req, res) => {
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

app.get('/api/budgets', async (req, res) => {
  try {
    const budgets = await prisma.budget.findMany({
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
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

app.get('/api/recurrences', async (req, res) => {
  try {
    const recurrences = await prisma.recurrence.findMany({
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
    res.json(recurrences);
  } catch (error) {
    console.error('Error fetching recurrences:', error);
    res.status(500).json({ error: 'Failed to fetch recurrences' });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    // Données mockup pour le dashboard
    const summary = {
      totalIncome: 2500.00,
      totalExpenses: 1800.50,
      balance: 699.50,
      transactionCount: 15,
      totalBanks: 3,
      totalCategories: 10
    };

    const recentTransactions = await prisma.transaction.findMany({
      take: 5,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
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
      }
    });

    const expensesByCategory = [];
    const upcomingRecurrences = [];

    res.json({
      summary,
      recentTransactions,
      expensesByCategory,
      upcomingRecurrences
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
