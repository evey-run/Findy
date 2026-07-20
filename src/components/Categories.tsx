import { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Category, Budget } from '../types';
import {
  PlusIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface EditingCategory {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'FIXED';
  color: string;
  keywords?: string[];
  budget?: {
    amount: string;
    period: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
    startDate: string;
  };
}

interface BudgetSpending {
  budget: Budget;
  totalSpent: number;
  remaining: number;
  percentage: number;
  isOverBudget: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `${Math.round(n).toLocaleString('fr-FR')} €`;

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const v = n / 1000;
    return `${(Math.round(v * 10) / 10).toLocaleString('fr-FR')} k€`;
  }
  return fmt(n);
};

const emptyForm: EditingCategory = {
  id: '',
  name: '',
  type: 'EXPENSE',
  color: '#7c3aed',
  keywords: [],
  budget: {
    amount: '',
    period: 'MONTHLY',
    startDate: new Date().toISOString().split('T')[0],
  },
};

const categoryTypes = [
  { value: 'INCOME', label: 'Revenu', icon: '📈', color: '#22c55e' },
  { value: 'EXPENSE', label: 'Dépense', icon: '📉', color: '#ef4444' },
  { value: 'FIXED', label: 'Fixe', icon: '📌', color: '#6b7280' },
];

const predefinedColors = [
  '#54478c', '#2c699a', '#048ba8', '#0db39e', '#16db93',
  '#83e377', '#b9e769', '#efea5a', '#f1c453', '#f29e4c',
];

// ── DonutChart (camembert) ──────────────────────────────────────────────
function DonutChart({ data, centerLabel, centerValue: _centerValue }: {
  data: { label: string; value: number; color: string }[];
  centerLabel: string; centerValue: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 180, cx = size / 2, cy = size / 2, radius = 78, inner = 52;
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
    return { path, color: d.color, key: i, label: d.label, value: d.value };
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size}>
          {total > 0
            ? arcs.map(a => <path key={a.key} d={a.path} fill={a.color} />)
            : <circle cx={cx} cy={cy} r={(radius + inner) / 2} fill="none" stroke="#27272a" strokeWidth={radius - inner} />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">{centerLabel}</span>
          <span className="text-sm font-bold text-zinc-50">{total > 0 ? fmtCompact(total) : '—'}</span>
        </div>
      </div>
      {/* Legend */}
      {data.length > 0 && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-zinc-400">{d.label}</span>
              <span className="text-xs font-semibold text-zinc-300 tabular-nums">{fmtCompact(d.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Categories() {
  const {
    categories,
    budgets,
    allTransactions,
    loadCategories,
    loadBudgets,
    loadAllTransactions,
    addCategory,
    updateCategory,
    removeCategory,
    addBudget,
    updateBudget,
    removeBudget,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<EditingCategory | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [budgetSpending, setBudgetSpending] = useState<{ [key: string]: BudgetSpending }>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await Promise.allSettled([
          loadCategories(),
          loadBudgets(true),
          loadAllTransactions({ forceIgnoreSelectedBank: true, ignoreDateRange: true }),
        ]);
      } catch (e) {
        console.error('Error loading:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loadCategories, loadBudgets, loadAllTransactions]);

  useEffect(() => {
    if (!isFormOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeForm();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormOpen]);

  useEffect(() => {
    const spending: { [key: string]: BudgetSpending } = {};
    for (const budget of budgets) {
      const startDate = new Date(budget.startDate);
      const endDate = new Date(startDate);

      const periods: Record<string, () => void> = {
        WEEKLY: () => endDate.setDate(endDate.getDate() + 7),
        MONTHLY: () => endDate.setMonth(endDate.getMonth() + 1),
        QUARTERLY: () => endDate.setMonth(endDate.getMonth() + 3),
        YEARLY: () => endDate.setFullYear(endDate.getFullYear() + 1),
      };
      periods[budget.period]?.();

      const txns = allTransactions.filter((t: any) =>
        t.categoryId === budget.categoryId &&
        t.amount < 0 &&
        new Date(t.date) >= startDate &&
        new Date(t.date) <= endDate &&
        (!budget.bankId || t.bankId === budget.bankId)
      );

      const totalSpent = Math.abs(txns.reduce((sum, t) => sum + t.amount, 0));
      const remaining = Math.max(0, budget.amount - totalSpent);
      const percentage = budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0;

      spending[budget.id] = {
        budget,
        totalSpent,
        remaining,
        percentage,
        isOverBudget: totalSpent > budget.amount,
      };
    }
    setBudgetSpending(spending);
  }, [budgets, allTransactions]);

  const getCategoryBudget = (categoryId: string) =>
    budgets.find((b) => b.categoryId === categoryId);

  const getCategorySpending = (categoryId: string) => {
    const budget = getCategoryBudget(categoryId);
    return budget ? budgetSpending[budget.id] : null;
  };

  const openCreate = () => {
    setEditingCategory(null);
    setFormData(emptyForm);
    setIsFormOpen(true);
  };

  const openEdit = (category: Category) => {
    setOpenMenuId(null);
    const categoryBudget = getCategoryBudget(category.id);
    const data: EditingCategory = {
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
      keywords: category.keywords || [],
      budget: categoryBudget
        ? {
            amount: categoryBudget.amount.toString(),
            period: categoryBudget.period,
            startDate: categoryBudget.startDate.split('T')[0],
          }
        : {
            amount: '',
            period: 'MONTHLY',
            startDate: new Date().toISOString().split('T')[0],
          },
    };
    setEditingCategory(data);
    setFormData(data);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingCategory(null);
    setFormData(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.color) {
      toast.error('Remplissez tous les champs requis');
      return;
    }

    try {
      const isEdit = editingCategory;
      const categoryPayload = {
        name: formData.name,
        type: formData.type,
        color: formData.color,
        keywords: (formData.keywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean),
      };

      const categoryRes = await fetch(
        isEdit ? `/api/categories/${isEdit.id}` : '/api/categories',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(categoryPayload),
        }
      );

      if (!categoryRes.ok) throw new Error('Category save failed');
      const savedCategory = await categoryRes.json();

      if (isEdit) {
        updateCategory(isEdit.id, savedCategory);
      } else {
        addCategory(savedCategory);
      }

      // Handle budget
      if (formData.budget?.amount && formData.type === 'EXPENSE') {
        const existingBudget = getCategoryBudget(savedCategory.id);
        const budgetPayload = {
          amount: parseFloat(formData.budget.amount),
          period: formData.budget.period,
          startDate: formData.budget.startDate,
          shared: false,
          categoryId: savedCategory.id,
        };

        if (existingBudget) {
          const budgetRes = await fetch(`/api/budgets/${existingBudget.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(budgetPayload),
          });
          if (budgetRes.ok) {
            updateBudget(existingBudget.id, await budgetRes.json());
          }
        } else {
          const budgetRes = await fetch('/api/budgets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(budgetPayload),
          });
          if (budgetRes.ok) {
            addBudget(await budgetRes.json());
          }
        }
      } else if (isEdit) {
        const existingBudget = getCategoryBudget(isEdit.id);
        if (existingBudget && !formData.budget?.amount) {
          await fetch(`/api/budgets/${existingBudget.id}`, { method: 'DELETE' });
          removeBudget(existingBudget.id);
        }
      }

      toast.success(isEdit ? 'Catégorie mise à jour' : 'Catégorie créée');
      closeForm();
      await loadCategories();
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDelete = async (categoryId: string) => {
    setOpenMenuId(null);
    if (!confirm('Supprimer cette catégorie et son budget ?')) return;

    try {
      const budget = getCategoryBudget(categoryId);
      if (budget) {
        await fetch(`/api/budgets/${budget.id}`, { method: 'DELETE' });
        removeBudget(budget.id);
      }

      const res = await fetch(`/api/categories/${categoryId}`, { method: 'DELETE' });
      if (res.ok) {
        removeCategory(categoryId);
        toast.success('Catégorie supprimée');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const getTypeLabel = (type: string) => {
    const t = categoryTypes.find((ct) => ct.value === type);
    return t ? t.label : type;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  // ── Compute sorted expense categories ──
  const expenseCategories = categories.filter((c) => c.type === 'EXPENSE');
  const otherCategories = categories.filter((c) => c.type !== 'EXPENSE');

  // Expense cats with budgets, sorted by percentage desc (closest to limit first)
  const withBudget = expenseCategories
    .filter((c) => getCategoryBudget(c.id))
    .sort((a, b) => {
      const aSp = getCategorySpending(a.id);
      const bSp = getCategorySpending(b.id);
      return (bSp?.percentage ?? 0) - (aSp?.percentage ?? 0);
    });

  // Expense cats without budgets
  const withoutBudget = expenseCategories.filter((c) => !getCategoryBudget(c.id));

  // All remaining (non-expense)
  const noLimitCategories = [...withoutBudget, ...otherCategories];

  // Donut data: expenses by category (ignoring limits)
  const donutData = expenseCategories
    .map((c) => {
      const totalSpent = allTransactions
        .filter((t: any) => t.categoryId === c.id && t.amount < 0)
        .reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0);
      return { label: c.name, value: totalSpent, color: c.color };
    })
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const totalExpenses = donutData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto custom-scrollbar pb-2">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Catégories</h2>
          {categories.length > 0 && (
            <span className="text-xs font-medium text-zinc-500">
              {categories.length} cat.
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3 py-1.5 transition-colors flex-shrink-0"
        >
          <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
          <span className="hidden sm:inline">Nouvelle catégorie</span>
        </button>
      </div>

      {/* ── Empty state ── */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <div className="h-11 w-11 rounded-xl bg-violet-500/10 flex items-center justify-center text-lg">
            📂
          </div>
          <p className="mt-4 text-sm font-medium text-zinc-300">
            Aucune catégorie pour le moment
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Créez votre première catégorie pour organiser vos transactions.
          </p>
          <button
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            Nouvelle catégorie
          </button>
        </div>
      ) : (
        /* ── Two-column layout ── */
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 min-h-0">

          {/* ── LEFT: category list ── */}
          <div className="flex flex-col gap-0 min-h-0 overflow-y-auto custom-scrollbar">
            {/* Budget categories — sorted by limit proximity */}
            {withBudget.map((category) => {
              const spending = getCategorySpending(category.id)!;
              const budget = getCategoryBudget(category.id)!;
              const hasOverBudget = spending.isOverBudget;
              const percentage = spending.percentage;

              return (
                <div
                  key={category.id}
                  className="group px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  {/* Top row: dot + name + actions */}
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-100 truncate">{category.name}</div>
                    </div>
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === category.id ? null : category.id);
                        }}
                        className={`h-6 w-6 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-all ${
                          openMenuId === category.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title="Actions"
                      >
                        <EllipsisHorizontalIcon className="h-5 w-5" />
                      </button>
                      {openMenuId === category.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                          <div className="absolute right-0 top-7 z-20 w-44 rounded-lg bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden py-1">
                            <button onClick={() => openEdit(category)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors">
                              <PencilSquareIcon className="h-4 w-4 text-zinc-500" />
                              Modifier
                            </button>
                            <button onClick={() => handleDelete(category.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                              <TrashIcon className="h-4 w-4" />
                              Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bottom row: full-width progress bar */}
                  <div className="mt-1.5 ml-[18px]">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10px] text-zinc-500 tabular-nums">{fmtCompact(spending.totalSpent)} / {fmtCompact(budget.amount)}</span>
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: hasOverBudget ? '#ef4444' : '#a78bfa' }}>
                        {Math.round(percentage)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(percentage, 100)}%`,
                          backgroundColor: hasOverBudget ? '#ef4444' : '#a78bfa',
                        }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">
                      {hasOverBudget
                        ? <span className="text-red-400">Dépassé de {fmtCompact(spending.totalSpent - budget.amount)}</span>
                        : <>{fmtCompact(spending.remaining)} restant</>
                      }
                    </div>
                  </div>
                </div>
              );
            })}

            {/* ── Separator ── */}
            {withBudget.length > 0 && noLimitCategories.length > 0 && (
              <div className="my-1 mx-3 border-t border-white/[0.06]" />
            )}

            {/* Categories without limits */}
            {noLimitCategories.map((category) => {
              return (
                <div
                  key={category.id}
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-100 truncate">{category.name}</div>
                    <div className="text-[11px] text-zinc-500">{getTypeLabel(category.type)}</div>
                  </div>

                  {/* Keywords */}
                  {category.keywords && category.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mr-2">
                      {category.keywords.slice(0, 2).map((kw) => (
                        <span key={kw} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-400">{kw}</span>
                      ))}
                      {category.keywords.length > 2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded text-zinc-500">+{category.keywords.length - 2}</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === category.id ? null : category.id);
                      }}
                      className={`h-6 w-6 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-all ${
                        openMenuId === category.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="Actions"
                    >
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                    </button>
                    {openMenuId === category.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 top-7 z-20 w-44 rounded-lg bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden py-1">
                          <button onClick={() => openEdit(category)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors">
                            <PencilSquareIcon className="h-4 w-4 text-zinc-500" />
                            Modifier
                          </button>
                          <button onClick={() => handleDelete(category.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                            <TrashIcon className="h-4 w-4" />
                            Supprimer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── RIGHT: donut chart ── */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5 flex flex-col items-center justify-center gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-2">Dépenses par catégorie</h3>
            <DonutChart
              data={donutData}
              centerLabel="Total"
              centerValue={totalExpenses > 0 ? fmtCompact(totalExpenses) : '—'}
            />
          </div>
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeForm} />
          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-md rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-base font-semibold text-zinc-50">
                {editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nom de la catégorie
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors"
                  placeholder="Alimentation, Maison, etc."
                  autoFocus
                  required
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {categoryTypes.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: t.value as 'INCOME' | 'EXPENSE' | 'FIXED' })}
                      className={`text-center py-2 px-3 rounded-lg border transition-colors ${
                        formData.type === t.value
                          ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300'
                      }`}
                    >
                      <div className="text-lg">{t.icon}</div>
                      <div className="text-xs font-medium mt-0.5">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Couleur</label>
                <div className="grid grid-cols-5 gap-2">
                  {predefinedColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`h-8 rounded-lg border-2 transition-all ${
                        formData.color === color
                          ? 'border-white/60 shadow-lg'
                          : 'border-transparent hover:border-white/20'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              {/* Budget (only for EXPENSE) */}
              {formData.type === 'EXPENSE' && (
                <>
                  <div className="pt-2 border-t border-white/[0.06]">
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                      Budget <span className="text-zinc-600">(optionnel)</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Montant</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          value={formData.budget?.amount || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              budget: {
                                ...formData.budget!,
                                amount: e.target.value,
                              },
                            })
                          }
                          className="w-full rounded-lg bg-zinc-800/60 border border-white/10 pl-3 pr-7 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors tabular-nums"
                          placeholder="500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                          €
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Période</label>
                      <select
                        value={formData.budget?.period || 'MONTHLY'}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            budget: {
                              ...formData.budget!,
                              period: e.target.value as 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY',
                            },
                          })
                        }
                        className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors [color-scheme:dark]"
                      >
                        <option value="WEEKLY">Hebdo</option>
                        <option value="MONTHLY">Mensuel</option>
                        <option value="QUARTERLY">Trim.</option>
                        <option value="YEARLY">Annuel</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Date de début</label>
                    <input
                      type="date"
                      value={formData.budget?.startDate || ''}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          budget: {
                            ...formData.budget!,
                            startDate: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors [color-scheme:dark]"
                    />
                  </div>
                </>
              )}

              {/* Keywords */}
              <div className="pt-2 border-t border-white/[0.06]">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Mots-clés <span className="text-zinc-600">(optionnel)</span>
                </label>
                {formData.keywords && formData.keywords.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {formData.keywords.map((kw) => (
                      <button
                        key={kw}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            keywords: formData.keywords!.filter((k) => k !== kw),
                          })
                        }
                        className="text-xs px-2 py-1 rounded-md bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 transition-colors"
                      >
                        {kw} ×
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Ajouter un mot-clé puis Entrée"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const kw = (e.target as HTMLInputElement).value.trim().toLowerCase();
                      if (kw && !formData.keywords?.includes(kw)) {
                        setFormData({
                          ...formData,
                          keywords: [...(formData.keywords || []), kw],
                        });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-lg bg-violet-600 hover:bg-violet-500 px-3.5 py-2 text-sm font-medium text-white transition-colors"
              >
                {editingCategory ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
