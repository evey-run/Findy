import express from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validate } from '../middlewares/validate';
import { OverviewQuery, MonthlyTrendsQuery, BudgetStatusQuery } from '../schemas/dashboard';
import type { z } from 'zod';

const router = express.Router();

// GET /api/dashboard/overview - Vue d'ensemble pour le tableau de bord
router.get('/overview', validate({ query: OverviewQuery }), async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query as unknown as z.infer<typeof OverviewQuery>;

    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    const userFilter = userId ? { userId } : {};
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
    
    // Déterminer la période à utiliser (soit celle fournie dans les paramètres, soit le mois actuel)
    let periodStart, periodEnd;
    
    if (Object.keys(dateFilter).length > 0) {
      // Utiliser la période fournie dans les paramètres
      periodStart = dateFilter.gte || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      periodEnd = dateFilter.lte || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    } else {
      // Utiliser le mois actuel par défaut
      periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    }
    
    
    // Revenus vs Dépenses par type de compte
    const [incomeSum, expenseSum, currentAccountIncome, currentAccountExpense, savingsAccountIncome, investmentAccountExpense] = await Promise.all([
      // Total income
      prisma.transaction.aggregate({
        where: { ...transactionWhere, amount: { gt: 0 } },
        _sum: { amount: true }
      }),
      // Total expense
      prisma.transaction.aggregate({
        where: { ...transactionWhere, amount: { lt: 0 } },
        _sum: { amount: true }
      }),
      // Current account income (for the selected period)
      prisma.transaction.aggregate({
        where: { 
          amount: { gt: 0 },
          bank: { accountType: 'CURRENT' },
          ...userFilter,
          date: {
            gte: periodStart,
            lte: periodEnd
          }
        },
        _sum: { amount: true }
      }),
      // Current account expense (for the selected period)
      prisma.transaction.aggregate({
        where: { 
          amount: { lt: 0 },
          bank: { accountType: 'CURRENT' },
          ...userFilter,
          date: {
            gte: periodStart,
            lte: periodEnd
          }
        },
        _sum: { amount: true }
      }),
      // Savings account income (for the selected period)
      prisma.transaction.aggregate({
        where: { 
          amount: { gt: 0 },
          bank: { accountType: 'SAVINGS' },
          ...userFilter,
          date: {
            gte: periodStart,
            lte: periodEnd
          }
        },
        _sum: { amount: true }
      }),
      // Investment account expense (for the selected period)
      prisma.transaction.aggregate({
        where: { 
          amount: { lt: 0 },
          bank: { accountType: 'INVESTMENT' },
          ...userFilter,
          date: {
            gte: periodStart,
            lte: periodEnd
          }
        },
        _sum: { amount: true }
      })
    ]);
    
    const totalIncome = incomeSum._sum.amount || 0;
    const totalExpenses = Math.abs(expenseSum._sum.amount || 0);
    const balance = totalIncome - totalExpenses;
    
    // Statistiques spécifiques par type de compte
    const currentMonthIncome = currentAccountIncome._sum.amount || 0;
    const currentMonthExpense = Math.abs(currentAccountExpense._sum.amount || 0);
    const savingsTotal = savingsAccountIncome._sum.amount || 0;
    const investmentMonthTotal = Math.abs(investmentAccountExpense._sum.amount || 0);
    
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
        totalCategories,
        // Nouvelles statistiques par type de compte
        currentMonthIncome,
        currentMonthExpense,
        savingsTotal,
        investmentMonthTotal
      },
      recentTransactions,
      expensesByCategory: categoriesData,
      upcomingRecurrences
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching dashboard overview');
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
});

// GET /api/dashboard/monthly-trends - Tendances mensuelles
router.get('/monthly-trends', validate({ query: MonthlyTrendsQuery }), async (req, res) => {
  try {
    const { userId, months } = req.query as unknown as z.infer<typeof MonthlyTrendsQuery>;
    const monthsBack = months ?? 6;

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - monthsBack);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    // Filtrage par utilisateur via la table de jointure user_banks (paramétré)
    const userClause = userId
      ? Prisma.sql`AND t.bankId IN (SELECT bankId FROM user_banks WHERE userId = ${userId})`
      : Prisma.empty;

    const monthlyData = await prisma.$queryRaw`
      SELECT
        strftime('%Y-%m', t.date) as month,
        SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as income,
        SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount) ELSE 0 END) as expenses,
        COUNT(*) as transactionCount
      FROM transactions t
      WHERE t.date >= ${startDate}
        ${userClause}
      GROUP BY strftime('%Y-%m', t.date)
      ORDER BY month ASC
    `;

    res.json(monthlyData);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching monthly trends');
    res.status(500).json({ error: 'Failed to fetch monthly trends' });
  }
});

// GET /api/dashboard/budget-status - Statut des budgets
router.get('/budget-status', validate({ query: BudgetStatusQuery }), async (req, res) => {
  try {
    const { userId } = req.query as unknown as z.infer<typeof BudgetStatusQuery>;


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
    logger.error({ err: error }, 'Error fetching budget status');
    res.status(500).json({ error: 'Failed to fetch budget status' });
  }
});

export default router;
