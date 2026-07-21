import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import type { Objective, Transaction } from '../types';
import {
  TrophyIcon,
  PlusIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface ObjectiveProgress {
  objective: Objective;
  transactions: Transaction[];
  totalSaved: number;
  remaining: number;
  percentage: number;
  isCompleted: boolean;
  searchPattern: string;
  recentTransactions: Transaction[];
}

const emptyForm = {
  title: '',
  description: '',
  targetAmount: '',
  deadline: '',
  icon: 'TrophyIcon',
};

// ── Helpers ──────────────────────────────────────────────────────────────
const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} €`;

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const v = n / 1000;
    return `${(Math.round(v * 10) / 10).toLocaleString('fr-FR')} k€`;
  }
  return fmt(n);
};

const fmtDeadline = (d: string) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

const isOverdue = (deadline: string) => new Date(deadline) < new Date();

export default function Budgets() {
  const navigate = useNavigate();
  const { loadCategories, loadBanks, requestConfirm } = useAppStore();

  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [objectiveProgress, setObjectiveProgress] = useState<{ [key: string]: ObjectiveProgress }>({});
  const [loading, setLoading] = useState(true);

  // Modal (create + edit share the same form)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [formData, setFormData] = useState(emptyForm);

  // Per-card actions menu
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadObjectives();
    loadCategories();
    loadBanks();
  }, [loadCategories, loadBanks]);

  useEffect(() => {
    objectives.forEach((objective) => fetchObjectiveProgress(objective.id));
  }, [objectives]);

  // Close modal on Escape
  useEffect(() => {
    if (!isFormOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeForm();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormOpen]);

  const loadObjectives = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/objectives');
      if (response.ok) {
        setObjectives(await response.json());
      }
    } catch (error) {
      console.error('Error loading objectives:', error);
      toast.error('Erreur lors du chargement des objectifs');
    } finally {
      setLoading(false);
    }
  };

  const fetchObjectiveProgress = async (objectiveId: string) => {
    try {
      const response = await fetch(`/api/objectives/${objectiveId}/progress`);
      if (response.ok) {
        const data = await response.json();
        setObjectiveProgress((prev) => ({ ...prev, [objectiveId]: data }));
      }
    } catch (error) {
      console.error('Error fetching objective progress:', error);
    }
  };

  // ── Form open/close ──────────────────────────────────────────────────
  const openCreate = () => {
    setEditingObjective(null);
    setFormData(emptyForm);
    setIsFormOpen(true);
  };

  const openEdit = (objective: Objective) => {
    setOpenMenuId(null);
    setEditingObjective(objective);
    setFormData({
      title: objective.title,
      description: objective.description || '',
      targetAmount: objective.targetAmount.toString(),
      deadline: objective.deadline ? objective.deadline.split('T')[0] : '',
      icon: objective.icon || 'TrophyIcon',
    });
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingObjective(null);
    setFormData(emptyForm);
  };

  // ── CRUD ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.targetAmount) {
      toast.error('Veuillez remplir tous les champs requis');
      return;
    }

    const payload = {
      ...formData,
      targetAmount: parseFloat(formData.targetAmount),
      deadline: formData.deadline || null,
    };

    try {
      const editing = editingObjective;
      const response = await fetch(
        editing ? `/api/objectives/${editing.id}` : '/api/objectives',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) throw new Error(await response.text());

      const saved = await response.json();
      if (editing) {
        setObjectives((prev) => prev.map((o) => (o.id === editing.id ? saved : o)));
        toast.success('Objectif mis à jour');
      } else {
        setObjectives((prev) => [saved, ...prev]);
        toast.success('Objectif créé');
      }
      closeForm();
    } catch (error) {
      console.error('Error saving objective:', error);
      toast.error("Erreur lors de la sauvegarde de l'objectif");
    }
  };

  const handleDelete = async (objectiveId: string) => {
    setOpenMenuId(null);
    if (!(await requestConfirm('Êtes-vous sûr de vouloir supprimer cet objectif ?', { title: 'Supprimer l\'objectif', confirmLabel: 'Supprimer', danger: true }))) return;

    try {
      const response = await fetch(`/api/objectives/${objectiveId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Erreur lors de la suppression');
      setObjectives((prev) => prev.filter((o) => o.id !== objectiveId));
      toast.success('Objectif supprimé');
    } catch (error) {
      console.error('Error deleting objective:', error);
      toast.error("Erreur lors de la suppression de l'objectif");
    }
  };

  const handleArchive = async (objective: Objective) => {
    setOpenMenuId(null);
    try {
      const response = await fetch(`/api/objectives/${objective.id}/archive`, { method: 'PATCH' });
      if (!response.ok) throw new Error("Erreur lors de l'archivage");
      const updated = await response.json();
      setObjectives((prev) => prev.map((o) => (o.id === objective.id ? updated : o)));
      toast.success(objective.archived ? 'Objectif désarchivé' : 'Objectif archivé');
    } catch (error) {
      console.error('Error archiving objective:', error);
      toast.error("Erreur lors de l'archivage de l'objectif");
    }
  };

  const viewTransactions = (objective: Objective) => {
    setOpenMenuId(null);
    navigate(`/transactions?search=${encodeURIComponent(`Économie ${objective.title}`)}`);
  };

  // ── Filter objectives by archived status ──────────────────────────────
  const visibleObjectives = objectives.filter((o) => showArchived ? o.archived : !o.archived);

  // ── Aggregate stats ──────────────────────────────────────────────────
  const totalObjectives = visibleObjectives.length;
  const completedObjectives = visibleObjectives.filter((o) => {
    const p = objectiveProgress[o.id];
    return p ? p.isCompleted : o.isCompleted;
  }).length;
  const totalTargetAmount = visibleObjectives.reduce((sum, o) => sum + o.targetAmount, 0);
  const totalSaved = visibleObjectives.reduce(
    (sum, o) => sum + (objectiveProgress[o.id]?.totalSaved ?? 0),
    0
  );
  const globalPct = totalTargetAmount > 0 ? Math.round((totalSaved / totalTargetAmount) * 100) : 0;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  const stats = [
    { label: 'Objectifs', value: totalObjectives.toString() },
    { label: 'Atteints', value: `${completedObjectives}/${totalObjectives || 0}` },
    { label: 'Économisé', value: fmtCompact(totalSaved) },
    { label: 'Cible totale', value: fmtCompact(totalTargetAmount) },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto custom-scrollbar pb-2">
      {/* ── Header (compact, single row) ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Objectifs</h2>
          {totalObjectives > 0 && (
            <span className="text-xs font-medium text-zinc-500 tabular-nums">
              {globalPct}% · {fmtCompact(totalSaved)} / {fmtCompact(totalTargetAmount)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-medium px-3 py-1.5 transition-colors ${
              showArchived
                ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                : 'bg-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/10'
            }`}
          >
            <ArchiveBoxIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{showArchived ? 'Archivés' : 'Archiver'}</span>
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3 py-1.5 transition-colors"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Nouvel objectif</span>
          </button>
        </div>
      </div>

      {/* ── KPI bar (single card, divided) ── */}
      {totalObjectives > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl bg-white/[0.04] border border-white/[0.08] divide-x divide-white/[0.06] overflow-hidden">
          {stats.map((s) => (
            <div key={s.label} className="px-4 py-2.5">
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {s.label}
              </div>
              <div className="mt-0.5 text-base font-semibold text-zinc-50 tabular-nums">
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {totalObjectives === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <div className="h-11 w-11 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <TrophyIcon className="h-5 w-5 text-violet-400" />
          </div>
          <p className="mt-4 text-sm font-medium text-zinc-300">Aucun objectif pour le moment</p>
          <p className="mt-1 text-xs text-zinc-500">Créez votre premier objectif d'épargne.</p>
          <button
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            Nouvel objectif
          </button>
        </div>
      ) : (
        /* ── Dense grid of compact cards ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {visibleObjectives.map((objective) => {
            const progress = objectiveProgress[objective.id];
            const percentage = progress ? progress.percentage : 0;
            const isCompleted = progress ? progress.isCompleted : objective.isCompleted;
            const saved = progress?.totalSaved ?? 0;
            const remaining = progress?.remaining ?? objective.targetAmount;
            const { deadline } = objective;
            const overdue = deadline && isOverdue(deadline) && !isCompleted;
            const accent = isCompleted ? '#22c55e' : '#a78bfa';

            return (
              <div
                key={objective.id}
                className={`group relative rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.05] ${objective.archived ? 'opacity-50' : ''}`}
              >
                {/* Row 1 — icon + title + actions */}
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: isCompleted ? 'rgba(34,197,94,0.12)' : 'rgba(124,58,237,0.14)' }}
                  >
                    {isCompleted ? (
                      <CheckCircleIcon className="h-4 w-4 text-green-400" />
                    ) : (
                      <TrophyIcon className="h-4 w-4 text-violet-400" />
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-50 truncate flex-1">
                    {objective.title}
                  </h3>

                  {/* Actions menu */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === objective.id ? null : objective.id);
                      }}
                      className={`h-6 w-6 -mr-1 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-all ${
                        openMenuId === objective.id ? 'opacity-100' : 'opacity-100'
                      }`}
                      title="Actions"
                    >
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                    </button>

                    {openMenuId === objective.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 top-7 z-20 w-44 rounded-lg bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden py-1">
                          <button
                            onClick={() => openEdit(objective)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                          >
                            <PencilSquareIcon className="h-4 w-4 text-zinc-500" />
                            Modifier
                          </button>
                          <button
                            onClick={() => viewTransactions(objective)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                          >
                            <ArrowUpRightIcon className="h-4 w-4 text-zinc-500" />
                            Transactions
                          </button>
                          <button
                            onClick={() => handleArchive(objective)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                          >
                            <ArchiveBoxIcon className="h-4 w-4 text-zinc-500" />
                            {objective.archived ? 'Désarchiver' : 'Archiver'}
                          </button>
                          <button
                            onClick={() => handleDelete(objective.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                          >
                            <TrashIcon className="h-4 w-4" />
                            Supprimer
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Row 2 — amounts + percentage */}
                <div className="mt-3 flex items-end justify-between">
                  <div className="text-sm tabular-nums">
                    <span className="font-semibold text-zinc-50">{fmt(saved)}</span>
                    <span className="text-zinc-500"> / {fmt(objective.targetAmount)}</span>
                  </div>
                  <span
                    className="text-base font-bold tabular-nums leading-none"
                    style={{ color: accent }}
                  >
                    {Math.round(percentage)}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: accent }}
                  />
                </div>

                {/* Row 3 — remaining (emphasis) + deadline */}
                <div className="mt-2.5 flex items-center justify-between text-xs">
                  <span className={isCompleted ? 'text-green-400 font-medium' : 'text-zinc-400'}>
                    {isCompleted ? 'Objectif atteint 🎉' : `${fmt(remaining)} restant`}
                  </span>
                  {deadline && (
                    <span
                      className={`tabular-nums ${overdue ? 'text-red-400 font-medium' : 'text-zinc-500'}`}
                    >
                      {fmtDeadline(deadline)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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
                {editingObjective ? "Modifier l'objectif" : 'Nouvel objectif'}
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
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Titre</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors"
                  placeholder="Vacances, Voiture, Épargne…"
                  autoFocus
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Montant cible</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="1"
                      value={formData.targetAmount}
                      onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                      className="w-full rounded-lg bg-zinc-800/60 border border-white/10 pl-3 pr-7 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors tabular-nums"
                      placeholder="1000"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">€</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Échéance <span className="text-zinc-600">(optionnel)</span>
                  </label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors [color-scheme:dark]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Description <span className="text-zinc-600">(optionnel)</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors resize-none"
                  placeholder="Une courte note…"
                />
              </div>

              {!editingObjective && (
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Astuce : ajoutez des transactions «&nbsp;Économie {formData.title || '[Titre]'}&nbsp;»
                  pour alimenter automatiquement cet objectif.
                </p>
              )}
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
                {editingObjective ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
