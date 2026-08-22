import express from 'express';
import prisma from '../prisma';
import { resolveScope } from '../lib/scope';
import { computeBalance } from '../lib/balance';
import { computeForecast, type ForecastRecurrence, type ForecastTransaction } from '../lib/forecast';

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
            // Les catégories sont un catalogue commun : sans ce filtre, le
            // « dépensé » d'un budget agrégeait les transactions de TOUS les
            // espaces, y compris ceux dont le profil n'est pas membre.
            bank: { spaceId: { in: scope } },
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

// GET /api/dashboard/forecast?today=AAAA-MM-JJ — le reste à vivre prévisionnel.
//
// `today` est la date civile du client : « quel mois sommes-nous ? » est une
// question locale, et le serveur ne doit pas y répondre depuis son propre
// fuseau. À défaut, on retombe sur la date UTC du serveur.
router.get('/forecast', async (req, res) => {
  try {
    const scope = await resolveScope(req.query as any, req.authUserId);
    const today = parseCivilDate(req.query.today as string | undefined);

    const monthStart = new Date(Date.UTC(today.year, today.month - 1, 1));
    const monthEnd = new Date(Date.UTC(today.year, today.month, 1));
    // Aujourd'hui appartient au passé : le solde doit inclure la journée en cours.
    const cutoff = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
    const burnStart = new Date(cutoff.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Comptes dépensables : les comptes courants non archivés de la portée.
    // L'épargne et l'investissement ne sont pas de l'argent du quotidien.
    const banks = await prisma.bank.findMany({
      where: {
        spaceId: { in: scope },
        archived: false,
        // `spendable` tranche quand il est renseigné ; sinon on retombe sur le
        // type de compte. Une banque peut déclarer un livret comme compte
        // courant : ces 12 000 € d'épargne feraient dire à l'app qu'on peut
        // dépenser 1 300 €/jour.
        OR: [{ spendable: true }, { spendable: null, accountType: 'CURRENT' }],
      },
      select: {
        id: true, name: true, balance: true, accountType: true,
        spendable: true, ebLastSyncAt: true, ebStatus: true,
      },
    });
    const bankIds = banks.map((b) => b.id);

    if (bankIds.length === 0) {
      return res.json({
        state: 'blocked',
        perDay: null,
        blockers: ['NO_SPENDABLE_ACCOUNT'],
        warnings: [],
        accounts: [],
        daysInMonth: new Date(Date.UTC(today.year, today.month, 0)).getUTCDate(),
      });
    }

    // Le solde affiché est recalculé depuis les mouvements (`bank.balance` n'est
    // que le solde initial). On le borne à aujourd'hui : sans cela, une
    // transaction saisie à l'avance serait déduite ici ET reprojetée ensuite.
    const [assetSums, cashSums, recurrenceRows, monthRows, burnRows, budgets, firstTx, lastTx] = await Promise.all([
      prisma.transaction.groupBy({
        by: ['bankId'],
        where: { bankId: { in: bankIds }, quantity: { not: null }, date: { lt: cutoff } },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ['bankId'],
        where: { bankId: { in: bankIds }, quantity: null, date: { lt: cutoff } },
        _sum: { amount: true },
      }),
      prisma.recurrence.findMany({
        where: { active: true },
        include: { category: { select: { type: true } } },
      }),
      prisma.transaction.findMany({
        where: { bankId: { in: bankIds }, date: { gte: monthStart, lt: monthEnd } },
        select: { id: true, bankId: true, categoryId: true, amount: true, date: true },
      }),
      prisma.transaction.findMany({
        where: { bankId: { in: bankIds }, date: { gte: burnStart, lt: cutoff } },
        select: { id: true, bankId: true, categoryId: true, amount: true, date: true },
      }),
      prisma.budget.findMany({
        where: { spaceId: { in: scope }, period: 'MONTHLY' },
        select: { id: true, categoryId: true, bankId: true, amount: true },
      }),
      prisma.transaction.findFirst({
        where: { bankId: { in: bankIds } },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
      prisma.transaction.findFirst({
        where: { bankId: { in: bankIds }, date: { lt: cutoff } },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);

    const assetFlow = new Map(assetSums.map((g) => [g.bankId, g._sum.amount ?? 0]));
    const cashFlow = new Map(cashSums.map((g) => [g.bankId, g._sum.amount ?? 0]));
    const accounts = banks.map((bank) => ({
      id: bank.id,
      name: bank.name,
      /** `true` seulement si l'utilisateur l'a explicitement décidé. */
      explicit: bank.spendable === true,
      balance: computeBalance(bank, {
        assetFlow: assetFlow.get(bank.id) ?? 0,
        cashFlow: cashFlow.get(bank.id) ?? 0,
      }),
    }));
    const availableNow = accounts.reduce((sum, a) => sum + a.balance, 0);

    // Une récurrence sans compte n'est rattachable à aucun espace : la compter
    // ferait fuiter les charges d'un autre profil dans ce calcul.
    const scoped = recurrenceRows.filter((r) => r.bankId && bankIds.includes(r.bankId));
    const unscopedRecurrenceCount = recurrenceRows.filter((r) => !r.bankId).length;

    const recurrences: ForecastRecurrence[] = scoped.map((r) => ({
      id: r.id,
      amount: r.amount,
      frequency: r.frequency,
      nextDue: r.nextDue,
      description: r.description,
      bankId: r.bankId,
      categoryId: r.categoryId,
      categoryType: r.category?.type ?? 'EXPENSE',
    }));

    const toForecastTx = (t: { id: string; bankId: string | null; categoryId: string | null; amount: number; date: Date }): ForecastTransaction => ({
      id: t.id,
      bankId: t.bankId ?? '',
      categoryId: t.categoryId,
      amount: t.amount,
      date: t.date,
    });

    const lastSync = banks
      .map((b) => b.ebLastSyncAt)
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const lastDataDate = [lastTx?.date ?? null, lastSync]
      .filter((d): d is Date => d instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const forecast = computeForecast({
      today,
      availableNow,
      recurrences,
      monthTransactions: monthRows.map(toForecastTx),
      burnTransactions: burnRows.map(toForecastTx),
      budgets,
      firstTransactionDate: firstTx?.date ?? null,
      lastDataDate,
      unscopedRecurrenceCount,
    });

    if (banks.some((b) => b.ebStatus === 'EXPIRED')) forecast.warnings.push('CONSENT_EXPIRED');

    // Un compte qui pèse la majorité du solde sans le moindre mouvement récent
    // est presque toujours un livret mal typé. Plutôt que d'afficher un reste à
    // vivre gonflé en silence, on nomme le compte en cause.
    const activeBankIds = new Set(burnRows.map((t) => t.bankId));
    const dormant = accounts.filter(
      (a) => !a.explicit && a.balance > 0.5 * availableNow && !activeBankIds.has(a.id),
    );
    if (availableNow > 0 && dormant.length > 0) {
      forecast.warnings.push('DORMANT_ACCOUNT');
      (forecast as any).dormantAccounts = dormant.map((a) => ({ id: a.id, name: a.name, balance: a.balance }));
    }

    res.json({ ...forecast, accounts });
  } catch (error) {
    console.error('Error computing forecast:', error);
    res.status(500).json({ error: 'Failed to compute forecast' });
  }
});

/** `AAAA-MM-JJ` envoyé par le client, ou la date UTC du serveur en dernier recours. */
function parseCivilDate(value: string | undefined): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (match) {
    const [, year, month, day] = match;
    const parsed = { year: Number(year), month: Number(month), day: Number(day) };
    if (parsed.month >= 1 && parsed.month <= 12 && parsed.day >= 1 && parsed.day <= 31) return parsed;
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
}
