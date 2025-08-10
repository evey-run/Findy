import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/dashboard/overview - Vue d'ensemble pour le couple
router.get('/overview', async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;
    
    const dateFilter: any = {};
    if (startDate || endDate) {
      if (startDate) dateFilter.gte = new Date(startDate as string);
      if (endDate) dateFilter.lte = new Date(endDate as string);
    }
    
    const userFilter = userId ? { userId: userId as string } : {};
    const transactionWhere = {
      ...userFilter,
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
    };
    
    // Statistiques principales
    const [totalUsers, totalCategories, recentTransactions, summary] = await Promise.all([
      prisma.user.count(),
      prisma.category.count(),
      prisma.transaction.findMany({
        where: transactionWhere,
        include: {
          category: { select: { id: true, name: true, type: true, color: true, icon: true } },
          bank: { select: { id: true, name: true, color: true } }
        },
        orderBy: { date: 'desc' },
        take: 10
      }),
      prisma.transaction.aggregate({
        where: transactionWhere,
        _sum: { amount: true },
        _count: true
      })
    ]);
    
    // Revenus vs Dépenses
    const [incomeSum, expenseSum] = await Promise.all([
      prisma.transaction.aggregate({
        where: { ...transactionWhere, amount: { gt: 0 } },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { ...transactionWhere, amount: { lt: 0 } },
        _sum: { amount: true }
      })
    ]);
    
    const totalIncome = incomeSum._sum.amount || 0;
    const totalExpenses = Math.abs(expenseSum._sum.amount || 0);
    const balance = totalIncome - totalExpenses;
    
    // Dépenses par catégorie
    const expensesByCategory = await prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { ...transactionWhere, amount: { lt: 0 } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'asc' } }
    });
    
    const categoriesData = await Promise.all(
      expensesByCategory.map(async (item) => {
        const category = item.categoryId ? await prisma.category.findUnique({
          where: { id: item.categoryId },
          select: { name: true, color: true, icon: true }
        }) : null;
        return {
          categoryId: item.categoryId,
          categoryName: category?.name || 'Unknown',
          categoryColor: category?.color || '#6b7280',
          categoryIcon: category?.icon,
          amount: Math.abs(item._sum.amount || 0)
        };
      })
    );
    
    // Récurrences à venir
    const upcomingRecurrences = await prisma.recurrence.findMany({
      where: {
        active: true,
        nextDue: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }, // 7 jours
        ...(userId && { bank: { userBanks: { some: { userId: userId as string } } } })
      },
      include: {
        category: { select: { id: true, name: true, type: true, color: true, icon: true } },
        bank: { select: { id: true, name: true, color: true } }
      },
      orderBy: { nextDue: 'asc' },
      take: 5
    });
    
    res.json({
      summary: {
        totalIncome,
        totalExpenses,
        balance,
        transactionCount: summary._count || 0,
        totalUsers,
        totalCategories
      },
      recentTransactions,
      expensesByCategory: categoriesData,
      upcomingRecurrences
    });
  } catch (error) {
    console.error('Error fetching dashboard overview:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

// GET /api/dashboard/monthly-trends - Tendances mensuelles
router.get('/monthly-trends', async (req, res) => {
  try {
    const { userId, months = 6 } = req.query;
    
    const monthsBack = parseInt(months as string);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);
    
    const userFilter = userId ? { userId: userId as string } : {};
    
    const monthlyData = await prisma.$queryRaw`
      SELECT 
        strftime('%Y-%m', date) as month,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as expenses,
        COUNT(*) as transactionCount
      FROM transactions 
      WHERE date >= ${startDate}
        ${userId ? `AND userId = '${userId}'` : ''}
      GROUP BY strftime('%Y-%m', date)
      ORDER BY month ASC
    `;
    
    res.json(monthlyData);
  } catch (error) {
    console.error('Error fetching monthly trends:', error);
    res.status(500).json({ error: 'Failed to fetch monthly trends' });
  }
});

// GET /api/dashboard/budget-status - Statut des budgets
router.get('/budget-status', async (req, res) => {
  try {
    const { userId } = req.query;
    
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    
    const userFilter = userId ? { userId: userId as string } : {};
    
    const budgets = await prisma.budget.findMany({
      where: {
        ...userFilter,
        period: 'MONTHLY' // Pour l'instant, on se concentre sur les budgets mensuels
      },
      include: {
        category: { select: { id: true, name: true, color: true, icon: true } },
        bank: { select: { id: true, name: true, color: true } }
      }
    });
    
    const budgetStatus = await Promise.all(
      budgets.map(async (budget) => {
        const spent = await prisma.transaction.aggregate({
          where: {
            categoryId: budget.categoryId,
            date: {
              gte: startOfMonth,
              lte: endOfMonth
            },
            amount: { lt: 0 },
            ...(budget.bankId && { bankId: budget.bankId })
          },
          _sum: { amount: true }
        });
        
        const totalSpent = Math.abs(spent._sum.amount || 0);
        const remaining = Math.max(0, budget.amount - totalSpent);
        const percentage = budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0;
        
        return {
          budget,
          totalSpent,
          remaining,
          percentage: Math.round(percentage),
          status: percentage > 100 ? 'exceeded' : percentage > 80 ? 'warning' : 'good'
        };
      })
    );
    
    res.json(budgetStatus);
  } catch (error) {
    console.error('Error fetching budget status:', error);
    res.status(500).json({ error: 'Failed to fetch budget status' });
  }
});

export default router;
