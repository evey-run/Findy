import express from 'express';
import prisma from '../prisma';
import { resolveScope } from '../lib/scope';

const router = express.Router();

// GET /api/dashboard/overview - Vue d'ensemble pour le tableau de bord
router.get('/overview', async (req, res) => {
  try {
    const { userId, startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate || endDate) {
      if (startDate) dateFilter.gte = new Date(startDate as string);
      if (endDate) dateFilter.lte = new Date(endDate as string);
    }

    // Portée : les transactions héritent de l'espace de leur banque.
    const scope = await resolveScope(req.query as any, req.authUserId);
    const userFilter = scope ? { bank: { spaceId: { in: scope } } } : {};
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
          bank: { accountType: 'CURRENT', ...(userFilter.bank || {}) },
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
          bank: { accountType: 'CURRENT', ...(userFilter.bank || {}) },
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
          bank: { accountType: 'SAVINGS', ...(userFilter.bank || {}) },
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
          bank: { accountType: 'INVESTMENT', ...(userFilter.bank || {}) },
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
          categoryName: category?.name || 'Non catégorisé',
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
        ...(scope ? { bank: { spaceId: { in: scope } } } : {})
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
    
    // NB: l'ancienne version interpolait `userId` dans le template SQL, ce qui
    // était à la fois inopérant (chaîne littérale) et injectable. On passe par
    // Prisma, qui paramètre correctement — et la jointure user_banks disparaît :
    // la portée est désormais une simple colonne `banks.spaceId`.
    const scope = await resolveScope(req.query as any, req.authUserId);

    const rows = await prisma.transaction.findMany({
      where: {
        date: { gte: startDate },
        ...(scope ? { bank: { spaceId: { in: scope } } } : {})
      },
      select: { date: true, amount: true }
    });

    const buckets = new Map<string, { month: string; income: number; expenses: number; transactionCount: number }>();
    for (const row of rows) {
      const month = row.date.toISOString().slice(0, 7);
      const bucket = buckets.get(month) ?? { month, income: 0, expenses: 0, transactionCount: 0 };
      if (row.amount > 0) bucket.income += row.amount;
      else bucket.expenses += Math.abs(row.amount);
      bucket.transactionCount += 1;
      buckets.set(month, bucket);
    }
    const monthlyData = [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
    
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
    
    // Budget n'a jamais eu de `userId` : l'ancien filtre faisait planter Prisma
    // dès qu'un userId était passé. On filtre par espace, ce qui est le sens voulu.
    const scope = await resolveScope(req.query as any, req.authUserId);

    const budgets = await prisma.budget.findMany({
      where: {
        ...(scope ? { spaceId: { in: scope } } : {}),
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
