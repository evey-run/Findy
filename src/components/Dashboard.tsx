import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../store/index';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(amount: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
}

function fmtCompact(amount: number) {
  if (Math.abs(amount) >= 1000) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'EUR',
      notation: 'compact', maximumFractionDigits: 1,
    }).format(amount);
  }
  return fmt(amount);
}

const FREQ_LABEL: Record<string, string> = {
  DAILY: 'Quotidien', WEEKLY: 'Hebdo', MONTHLY: 'Mensuel',
  QUARTERLY: 'Trimestriel', YEARLY: 'Annuel',
};

// ─── skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ h = 'h-5', w = 'w-24', className = '' }) {
  return <div className={`${h} ${w} bg-zinc-800 rounded animate-pulse ${className}`} />;
}

// ─── TrendPill ──────────────────────────────────────────────────────────────

function TrendPill({ pct, invertColor = false }: { pct: number; invertColor?: boolean }) {
  if (pct === 0) return <span className="text-xs text-zinc-500">Stable</span>;
  const up = pct > 0;
  const good = invertColor ? !up : up;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>
      {up
        ? <ArrowTrendingUpIcon className="h-3 w-3" />
        : <ArrowTrendingDownIcon className="h-3 w-3" />}
      {Math.abs(pct)}%
    </span>
  );
}

// ─── DonutChart (camembère) ─────────────────────────────────────────────────

function DonutChart({ data, centerLabel, centerValue }: {
  data: { label: string; value: number; color: string }[];
  centerLabel: string; centerValue: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 168, cx = size / 2, cy = size / 2, radius = 74, inner = 50;
  const polar = (r: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });

  let angle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    let slice = total > 0 ? (d.value / total) * 2 * Math.PI : 0;
    if (slice >= 2 * Math.PI) slice = 2 * Math.PI - 0.001;
    const a0 = angle, a1 = angle + slice;
    angle = a1;
    const large = slice > Math.PI ? 1 : 0;
    const p0 = polar(radius, a0), p1 = polar(radius, a1);
    const q1 = polar(inner, a1), q0 = polar(inner, a0);
    const path = `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${large} 1 ${p1.x} ${p1.y} L ${q1.x} ${q1.y} A ${inner} ${inner} 0 ${large} 0 ${q0.x} ${q0.y} Z`;
    return { path, color: d.color, key: i };
  });

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {total > 0
          ? arcs.map(a => <path key={a.key} d={a.path} fill={a.color} />)
          : <circle cx={cx} cy={cy} r={(radius + inner) / 2} fill="none" stroke="#27272a" strokeWidth={radius - inner} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{centerLabel}</span>
        <span className="text-base font-bold text-zinc-50">{centerValue}</span>
      </div>
    </div>
  );
}

// ─── MonthlyFlux (barres revenus/dépenses) ──────────────────────────────────

function MonthlyFlux({ data }: { data: { label: string; income: number; expense: number }[] }) {
  const max = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-full w-full px-1">
      {data.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0">
          <div className="flex items-end justify-center gap-1 h-full w-full">
            <div
              className="w-2.5 rounded-t bg-green-500/80 transition-all duration-500"
              style={{ height: `${(m.income / max) * 100}%` }}
              title={`Revenus : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.income)}`}
            />
            <div
              className="w-2.5 rounded-t bg-red-500/70 transition-all duration-500"
              style={{ height: `${(m.expense / max) * 100}%` }}
              title={`Dépenses : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m.expense)}`}
            />
          </div>
          <span className="text-[10px] text-zinc-500 capitalize truncate">{m.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── StatCard ───────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, trend, invertTrend = false, to, loading,
}: {
  label: string; value: string; sub?: string;
  trend: number; invertTrend?: boolean; to: string; loading: boolean;
}) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-1 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4
        transition-all duration-200 hover:border-violet-500/25 hover:bg-white/[0.07] cursor-pointer"
    >
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{label}</p>
      {loading
        ? <><Skeleton h="h-7" w="w-28" className="mt-1" /><Skeleton h="h-3" w="w-16" className="mt-2" /></>
        : <>
            <p className="text-xl font-bold text-zinc-50 leading-tight">{value}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <TrendPill pct={trend} invertColor={invertTrend} />
              {sub && <span className="text-xs text-zinc-600">{sub}</span>}
            </div>
          </>
      }
    </Link>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    dashboardData,
    loadDashboardOverview,
    selectedUser,
    allTransactions,
    loadAllTransactions,
    categories,
    budgets,
    banks,
    isLoading,
    setDateRange,
  } = useAppStore();

  type PeriodType = 'week' | 'month' | 'year';
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [previousData, setPreviousData] = useState({ income: 0, expense: 0, savings: 0, investment: 0 });
  const [fluxData, setFluxData] = useState<{ label: string; income: number; expense: number }[]>([]);

  // ── period helpers ─────────────────────────────────────────────────────────

  const getPeriodName = (date: Date, type: PeriodType) => {
    if (type === 'week') {
      const start = new Date(date);
      const dow = start.getDay() || 7;
      start.setDate(start.getDate() - dow + 1);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      return `${start.getDate()}–${end.getDate()} ${start.toLocaleString('fr-FR', { month: 'long' })} ${start.getFullYear()}`;
    }
    if (type === 'month') return date.toLocaleString('fr-FR', { month: 'long' }) + ' ' + date.getFullYear();
    return date.getFullYear().toString();
  };

  const goToPrevious = () => setSelectedDate(prev => {
    const d = new Date(prev);
    if (periodType === 'week') d.setDate(d.getDate() - 7);
    else if (periodType === 'month') d.setMonth(d.getMonth() - 1);
    else d.setFullYear(d.getFullYear() - 1);
    return d;
  });

  const goToNext = () => setSelectedDate(prev => {
    const d = new Date(prev);
    if (periodType === 'week') d.setDate(d.getDate() + 7);
    else if (periodType === 'month') d.setMonth(d.getMonth() + 1);
    else d.setFullYear(d.getFullYear() + 1);
    return d > new Date() ? prev : d;
  });

  // ── date range calculation ─────────────────────────────────────────────────

  const { startDate, endDate, prevStart, prevEnd } = useMemo(() => {
    let start: Date, end: Date, ps: Date, pe: Date;
    if (periodType === 'week') {
      start = new Date(selectedDate);
      const dow = start.getDay() || 7;
      start.setDate(start.getDate() - dow + 1);
      end = new Date(start); end.setDate(end.getDate() + 6);
      ps = new Date(start); ps.setDate(ps.getDate() - 7);
      pe = new Date(end);   pe.setDate(pe.getDate() - 7);
    } else if (periodType === 'month') {
      start = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
      end   = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
      ps    = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
      pe    = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 0);
    } else {
      start = new Date(selectedDate.getFullYear(), 0, 1);
      end   = new Date(selectedDate.getFullYear(), 11, 31);
      ps    = new Date(selectedDate.getFullYear() - 1, 0, 1);
      pe    = new Date(selectedDate.getFullYear() - 1, 11, 31);
    }
    return { startDate: start.toISOString(), endDate: end.toISOString(), prevStart: ps.toISOString(), prevEnd: pe.toISOString() };
  }, [periodType, selectedDate]);

  // ── effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    setDateRange({ startDate, endDate });
    loadDashboardOverview();
    loadAllTransactions({ forceIgnoreSelectedBank: true });
  }, [startDate, endDate, selectedUser]);

  useEffect(() => {
    if (!prevStart) return;
    const prevParams = new URLSearchParams({ startDate: prevStart, endDate: prevEnd });
    if (selectedUser) prevParams.append('userId', selectedUser.id);
    fetch(`/api/dashboard/overview?${prevParams}`)
      .then(r => r.json())
      .then(data => setPreviousData({
        income:     data.summary?.currentMonthIncome     ?? 0,
        expense:    data.summary?.currentMonthExpense    ?? 0,
        savings:    data.summary?.savingsTotal           ?? 0,
        investment: data.summary?.investmentMonthTotal   ?? 0,
      }))
      .catch(() => {});
  }, [prevStart, prevEnd, selectedUser]);

  // Income/expense flux over the last 6 periods — reacts to periodType & selectedDate
  useEffect(() => {
    const ref = new Date(selectedDate);
    let buckets: { key: string; label: string; start: Date; end: Date; income: number; expense: number }[] = [];

    if (periodType === 'week') {
      const dow = ref.getDay() || 7;
      const curStart = new Date(ref); curStart.setDate(curStart.getDate() - dow + 1);
      buckets = Array.from({ length: 6 }, (_, i) => {
        const s = new Date(curStart); s.setDate(s.getDate() - (5 - i) * 7);
        const e = new Date(s); e.setDate(e.getDate() + 6);
        return {
          key: `${s.getFullYear()}-W${s.getTime()}`,
          label: s.toLocaleString('fr-FR', { day: 'numeric', month: 'short' }),
          start: s, end: e, income: 0, expense: 0,
        };
      });
    } else if (periodType === 'year') {
      const y = ref.getFullYear();
      buckets = Array.from({ length: 6 }, (_, i) => {
        const yr = y - (5 - i);
        const s = new Date(yr, 0, 1); const e = new Date(yr, 11, 31);
        return { key: `${yr}`, label: `${yr}`, start: s, end: e, income: 0, expense: 0 };
      });
    } else {
      buckets = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(ref.getFullYear(), ref.getMonth() - (5 - i), 1);
        const s = new Date(d.getFullYear(), d.getMonth(), 1);
        const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString('fr-FR', { month: 'short' }), start: s, end: e, income: 0, expense: 0 };
      });
    }

    const start = buckets[0].start;
    const end   = buckets[buckets.length - 1].end;
    const params = new URLSearchParams({
      limit: '5000', offset: '0',
      startDate: start.toISOString(), endDate: end.toISOString(),
    });
    if (selectedUser) params.append('userId', selectedUser.id);
    fetch(`/api/transactions?${params}`)
      .then(r => r.json())
      .then(data => {
        const txns = Array.isArray(data) ? data : (data?.transactions ?? []);
        txns.forEach((t: any) => {
          const d = new Date(t.date);
          const b = buckets.find(mm => d >= mm.start && d <= mm.end);
          if (b) {
            if (t.amount > 0) b.income += t.amount;
            else b.expense += Math.abs(t.amount);
          }
        });
        setFluxData(buckets.map(({ label, income, expense }) => ({ label, income, expense })));
      })
      .catch(() => {});
  }, [selectedUser, periodType, selectedDate]);

  // ── derived data ───────────────────────────────────────────────────────────

  const summary = dashboardData?.summary;
  const income     = summary?.currentMonthIncome    ?? 0;
  const expense    = summary?.currentMonthExpense   ?? 0;
  const savings    = summary?.savingsTotal          ?? 0;
  const investment = summary?.investmentMonthTotal  ?? 0;

  const calcTrend = (cur: number, prev: number) => {
    if (prev === 0) return 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  // Filter transactions for selected period
  const periodFilter = useMemo(() => {
    const s = new Date(startDate), e = new Date(endDate);
    return (d: Date) => d >= s && d <= e;
  }, [startDate, endDate]);

  // Budget to monthly-equivalent helper
  const toPeriodBudget = (b: { amount: number; period: string }) => {
    let v = b.amount;
    if (periodType === 'week') {
      if (b.period === 'MONTHLY') v /= 4.345;
      else if (b.period === 'QUARTERLY') v /= 13.035;
      else if (b.period === 'YEARLY') v /= 52.14;
    } else if (periodType === 'month') {
      if (b.period === 'WEEKLY') v *= 4.345;
      else if (b.period === 'QUARTERLY') v /= 3;
      else if (b.period === 'YEARLY') v /= 12;
    } else {
      if (b.period === 'WEEKLY') v *= 52.14;
      else if (b.period === 'MONTHLY') v *= 12;
      else if (b.period === 'QUARTERLY') v *= 4;
    }
    return v;
  };

  // Budget progress bars data
  const budgetData = useMemo(() => {
    return categories
      .filter(c => c.type === 'EXPENSE')
      .map(c => {
        const budget = budgets.find(b => b.categoryId === c.id);
        if (!budget) return null;
        if (!budget.shared && !banks.some(bk => bk.id === budget.bankId)) return null;
        const periodBudget = toPeriodBudget(budget);
        const spent = allTransactions
          .filter(t => t.categoryId === c.id && periodFilter(new Date(t.date)))
          .reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0);
        return { id: c.id, name: c.name, color: c.color, budget: periodBudget, spent };
      })
      .filter(Boolean)
      .sort((a, b) => b!.budget - a!.budget) as Array<{ id: string; name: string; color: string; budget: number; spent: number }>;
  }, [categories, budgets, banks, allTransactions, periodFilter, periodType]);

  // Recent transactions split
  const recentExpenses = useMemo(() =>
    allTransactions.filter(t => t.amount < 0).slice(0, 5), [allTransactions]);
  const recentIncome = useMemo(() =>
    allTransactions.filter(t => t.amount > 0).slice(0, 5), [allTransactions]);

  // Upcoming recurrences
  const upcoming = useMemo(() => {
    const list = dashboardData?.upcomingRecurrences ?? [];
    return [...list]
      .filter(r => r.active)
      .sort((a, b) => new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime())
      .slice(0, 6);
  }, [dashboardData]);

  // Savings rate
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;

  // Donut data — expenses by category for the current period (real API data)
  const donutData = useMemo(() => {
    const list = dashboardData?.expensesByCategory ?? [];
    return [...list]
      .filter(e => e.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map(e => ({ label: e.categoryName, value: e.amount, color: e.categoryColor || '#7c3aed' }));
  }, [dashboardData]);

  const donutTotal = donutData.reduce((s, d) => s + d.value, 0);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">

      {/* ── Header ── */}
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50 leading-tight">Tableau de bord</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Aperçu de vos finances en un coup d'œil</p>
        </div>

        {/* Period controls */}
        <div className="flex items-center gap-2">
          {/* Period type switcher */}
          <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
            {(['week', 'month', 'year'] as PeriodType[]).map(t => (
              <button
                key={t}
                onClick={() => setPeriodType(t)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                  periodType === t
                    ? 'bg-violet-600 text-white'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {t === 'week' ? 'Semaine' : t === 'month' ? 'Mois' : 'Année'}
              </button>
            ))}
          </div>

          {/* Prev / current / next */}
          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-1">
            <button onClick={goToPrevious} className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors rounded">
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-zinc-200 capitalize min-w-[120px] text-center">
              {getPeriodName(selectedDate, periodType)}
            </span>
            <button onClick={goToNext} className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors rounded">
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="flex-shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Revenus" to="/transactions"
          value={isLoading ? '' : fmtCompact(income)}
          trend={calcTrend(income, previousData.income)}
          loading={isLoading}
        />
        <StatCard
          label="Dépenses" to="/transactions"
          value={isLoading ? '' : fmtCompact(expense)}
          trend={calcTrend(expense, previousData.expense)}
          invertTrend loading={isLoading}
        />
        <StatCard
          label="Épargne" to="/banks"
          value={isLoading ? '' : fmtCompact(savings)}
          sub={income > 0 ? `Taux : ${savingsRate}%` : undefined}
          trend={calcTrend(savings, previousData.savings)}
          loading={isLoading}
        />
        <StatCard
          label="Investissements" to="/investissement"
          value={isLoading ? '' : fmtCompact(investment)}
          trend={calcTrend(investment, previousData.investment)}
          loading={isLoading}
        />
      </div>

      {/* ── Main area : 2 rows ── */}
      <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">

      {/* ── Row 1 : charts ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">

        {/* ── Flux mensuel (col 7) ── */}
        <div className="lg:col-span-7 flex flex-col min-h-0 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <span className="text-xs font-medium uppercase tracking-widest text-violet-400">
              Flux sur 6 {periodType === 'week' ? 'semaines' : periodType === 'year' ? 'ans' : 'mois'}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500/80" /> Revenus
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500/70" /> Dépenses
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 p-4">
            {fluxData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-zinc-600">Aucune donnée</p>
              </div>
            ) : (
              <MonthlyFlux data={fluxData} />
            )}
          </div>
        </div>

        {/* ── Catégories donut (col 5) ── */}
        <div className="lg:col-span-5 flex flex-col min-h-0 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <span className="text-xs font-medium uppercase tracking-widest text-violet-400">Dépenses par catégorie</span>
            <Link to="/categories" className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
              Détails →
            </Link>
          </div>
          <div className="flex-1 min-h-0 flex items-center gap-4 px-5 py-3 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center w-full">
                <div className="h-32 w-32 rounded-full border-8 border-zinc-800 animate-pulse" />
              </div>
            ) : donutTotal === 0 ? (
              <div className="flex items-center justify-center w-full">
                <p className="text-sm text-zinc-600">Aucune dépense sur la période</p>
              </div>
            ) : (
              <>
                <DonutChart
                  data={donutData}
                  centerLabel="Total"
                  centerValue={fmtCompact(donutTotal)}
                />
                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                  {donutData.slice(0, 6).map((d, i) => (
                    <div key={i} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-xs text-zinc-300 truncate">{d.label}</span>
                      </div>
                      <span className="text-xs text-zinc-500 flex-shrink-0">
                        {Math.round((d.value / donutTotal) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2 : 3 columns ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">

        {/* ── Budgets (col 5) ── */}
        <div className="lg:col-span-5 flex flex-col min-h-0 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <span className="text-xs font-medium uppercase tracking-widest text-violet-400">Budgets</span>
            <Link to="/budgets" className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
              Voir tous →
            </Link>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton h="h-3" w="w-24" />
                    <Skeleton h="h-3" w="w-16" />
                  </div>
                  <Skeleton h="h-2" w="w-full" className="rounded-full" />
                </div>
              ))
            ) : budgetData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center">
                <div className="h-10 w-10 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
                  <span className="text-zinc-600 text-lg">%</span>
                </div>
                <p className="text-sm text-zinc-500">Aucun budget défini</p>
                <Link to="/budgets" className="text-xs text-violet-400 hover:text-violet-300 mt-1 transition-colors">
                  Créer un budget →
                </Link>
              </div>
            ) : (
              budgetData.map(d => {
                const pct = d.budget > 0 ? Math.min((d.spent / d.budget) * 100, 100) : 0;
                const over = d.spent > d.budget;
                const warn = !over && pct >= 80;
                const barColor = over ? '#ef4444' : warn ? '#f59e0b' : '#22c55e';
                return (
                  <div key={d.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-sm text-zinc-200 truncate">{d.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        <span className={`text-xs font-medium ${over ? 'text-red-400' : warn ? 'text-amber-400' : 'text-zinc-400'}`}>
                          {fmt(d.spent)}
                        </span>
                        <span className="text-xs text-zinc-600">/ {fmt(d.budget)}</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Transactions récentes (col 4) ── */}
        <div className="lg:col-span-4 flex flex-col min-h-0 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
            <span className="text-xs font-medium uppercase tracking-widest text-violet-400">Activité récente</span>
            <Link to="/transactions" className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
              Voir toutes →
            </Link>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="px-4 py-3 space-y-3 animate-pulse">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton h="h-7" w="w-7" className="rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton h="h-3" w="w-32" />
                      <Skeleton h="h-2.5" w="w-20" />
                    </div>
                    <Skeleton h="h-3" w="w-16" />
                  </div>
                ))}
              </div>
            ) : recentExpenses.length === 0 && recentIncome.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center px-4">
                <p className="text-sm text-zinc-500">Aucune transaction</p>
                <Link to="/transactions" className="text-xs text-violet-400 hover:text-violet-300 mt-1 transition-colors">
                  Importer un CSV →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {/* Expenses */}
                {recentExpenses.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1.5 text-xs font-medium text-zinc-600 uppercase tracking-wide">Dépenses</p>
                    {recentExpenses.map(t => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                        <div className="h-7 w-7 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-400 text-xs font-bold">−</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-100 truncate">{t.description}</p>
                          <p className="text-xs text-zinc-600">{new Date(t.date).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <span className="text-xs font-semibold text-red-400 flex-shrink-0">{fmt(Math.abs(t.amount))}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Income */}
                {recentIncome.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1.5 text-xs font-medium text-zinc-600 uppercase tracking-wide">Revenus</p>
                    {recentIncome.map(t => (
                      <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
                        <div className="h-7 w-7 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
                          <span className="text-green-400 text-xs font-bold">+</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-100 truncate">{t.description}</p>
                          <p className="text-xs text-zinc-600">{new Date(t.date).toLocaleDateString('fr-FR')}</p>
                        </div>
                        <span className="text-xs font-semibold text-green-400 flex-shrink-0">{fmt(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Prochains paiements (col 3) ── */}
        <div className="lg:col-span-3 flex flex-col min-h-0 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden">
          <div className="flex-shrink-0 px-5 py-3 border-b border-white/[0.06]">
            <span className="text-xs font-medium uppercase tracking-widest text-violet-400">Prochains paiements</span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="px-4 py-3 space-y-3 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton h="h-3" w="w-28" />
                    <Skeleton h="h-3" w="w-20" />
                  </div>
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-8 text-center px-4">
                <CalendarDaysIcon className="h-8 w-8 text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-500">Aucun paiement programmé</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {upcoming.map(r => {
                  const due = new Date(r.nextDue);
                  const today = new Date();
                  const daysLeft = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const soon = daysLeft <= 3;
                  return (
                    <div key={r.id} className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-100 truncate">{r.description}</p>
                        <p className={`text-xs mt-0.5 ${soon ? 'text-amber-400' : 'text-zinc-500'}`}>
                          {daysLeft === 0 ? "Aujourd'hui" : daysLeft === 1 ? 'Demain' : due.toLocaleDateString('fr-FR')}
                        </p>
                        <span className="inline-block text-[10px] text-zinc-600 mt-0.5">
                          {FREQ_LABEL[r.frequency] ?? r.frequency}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-zinc-300 flex-shrink-0 mt-0.5">
                        {fmt(Math.abs(r.amount))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
