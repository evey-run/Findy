import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { assetUrl } from '../lib/url';
import { useAppStore } from '../store';
import type { Debt, User } from '../types';

const fmtAmount = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR');

interface DebtsResponse {
  me: User;
  other: User;
  debts: Debt[];
  balance: number;
}

interface Transfer {
  id: string;
  date: string;
  amount: number;
  direction: 'me_to_other' | 'other_to_me';
  myDescription: string;
  otherDescription: string;
}

function Avatar({ user, size = 'md' }: { user?: User | null; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-sm';
  if (!user) return null;
  return user.avatar ? (
    <img src={assetUrl(user.avatar)} alt={user.name} className={`${cls} rounded-full object-cover ring-2 ring-white/10`} />
  ) : (
    <div className={`${cls} rounded-full bg-zinc-700 flex items-center justify-center text-white font-bold ring-2 ring-white/10`}>
      {user.name ? user.name[0].toUpperCase() : '?'}
    </div>
  );
}

export default function Tricount() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { users, loadUsers, requestConfirm } = useAppStore();

  const [data, setData] = useState<DebtsResponse | null>(null);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulaire d'ajout de dette
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<'me' | 'other'>('me');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/debts?userId=${userId}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error === 'NO_ME_USER'
          ? 'Aucun utilisateur « Moi » n\'est défini. Retournez sur les portefeuilles pour en choisir un.'
          : body.message || body.error || 'Erreur de chargement');
        setData(null);
        return;
      }
      setData(body);

      // Virements détectés (non bloquant)
      try {
        const tr = await fetch(`/api/debts/transfers?userId=${userId}`);
        if (tr.ok) {
          const tbody = await tr.json();
          setTransfers(tbody.transfers || []);
        }
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.error('Failed to load tricount:', e);
      setError('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (users.length === 0) loadUsers();
    load();
  }, [load]);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const parsed = parseFloat(amount);
    if (!description.trim() || isNaN(parsed) || parsed <= 0) {
      toast.error('Renseignez une description et un montant valide');
      return;
    }
    // payer = celui qui a avancé l'argent → l'autre lui doit.
    const fromUserId = payer === 'me' ? data.other.id : data.me.id;
    const toUserId = payer === 'me' ? data.me.id : data.other.id;

    setSubmitting(true);
    try {
      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromUserId, toUserId, amount: parsed, description: description.trim(), date }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
      setDescription('');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      toast.success('Dépense ajoutée');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'ajout');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSettled = async (debt: Debt) => {
    try {
      const res = await fetch(`/api/debts/${debt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settled: !debt.settled }),
      });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const deleteDebt = async (debt: Debt) => {
    if (!(await requestConfirm('Supprimer cette dépense ?', { title: 'Supprimer la dépense', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      const res = await fetch(`/api/debts/${debt.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error();
      await load();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  };

  const settleAll = async () => {
    if (!data) return;
    const unsettled = data.debts.filter((d) => !d.settled);
    if (unsettled.length === 0) return;
    if (!(await requestConfirm(`Solder le compte ? ${unsettled.length} dépense(s) seront marquées comme remboursées.`, { title: 'Solder le compte', confirmLabel: 'Solder' }))) return;
    try {
      await Promise.all(
        unsettled.map((d) =>
          fetch(`/api/debts/${d.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settled: true }),
          })
        )
      );
      toast.success('Compte soldé');
      await load();
    } catch {
      toast.error('Erreur lors du soldage');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-0 gap-4 text-center px-4">
        <p className="text-sm text-zinc-300 max-w-sm">{error || 'Tricount introuvable'}</p>
        <button
          onClick={() => navigate('/banks')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Retour aux portefeuilles
        </button>
      </div>
    );
  }

  const { me, other, balance } = data;
  const balancePositive = balance > 0.005; // other me doit
  const balanceNegative = balance < -0.005; // je dois à other

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto custom-scrollbar pb-2">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate('/banks')}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors flex-shrink-0"
          title="Retour"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Avatar user={me} size="sm" />
          <ArrowsRightLeftIcon className="h-4 w-4 text-zinc-500 flex-shrink-0" />
          <Avatar user={other} size="sm" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50 truncate">
              Tricount avec {other.name}
            </h2>
            <p className="text-xs text-zinc-500">Dépenses et dettes partagées</p>
          </div>
        </div>
      </div>

      {/* Balance card */}
      <div
        className={`rounded-2xl border p-5 shrink-0 ${
          balancePositive
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : balanceNegative
            ? 'bg-red-500/10 border-red-500/20'
            : 'bg-white/[0.04] border-white/[0.08]'
        }`}
      >
        {balancePositive ? (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-emerald-300/80">
              {other.name} vous doit
            </div>
            <div className="mt-1 text-2xl font-bold text-emerald-400 tabular-nums">{fmtAmount(balance)}</div>
          </>
        ) : balanceNegative ? (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-red-300/80">
              Vous devez à {other.name}
            </div>
            <div className="mt-1 text-2xl font-bold text-red-400 tabular-nums">{fmtAmount(Math.abs(balance))}</div>
          </>
        ) : (
          <>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-400">Solde</div>
            <div className="mt-1 text-2xl font-bold text-zinc-100 tabular-nums">Vous êtes à jour 🎉</div>
          </>
        )}
        {(balancePositive || balanceNegative) && (
          <button
            onClick={settleAll}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-zinc-100 text-xs font-medium px-3 py-1.5 transition-colors"
          >
            <CheckCircleIcon className="h-4 w-4" />
            Solder le compte
          </button>
        )}
      </div>

      {/* Add expense form */}
      <form
        onSubmit={handleAddDebt}
        className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 space-y-3 shrink-0"
      >
        <h3 className="text-sm font-semibold text-zinc-100">Ajouter une dépense</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (ex : Courses, Restaurant…)"
            className="rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors"
          />
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full sm:w-32 rounded-lg bg-zinc-800/60 border border-white/10 pl-3 pr-7 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors tabular-nums"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">€</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">Qui a avancé l'argent ?</span>
          <div className="inline-flex rounded-lg border border-white/10 overflow-hidden">
            <button
              type="button"
              onClick={() => setPayer('me')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                payer === 'me' ? 'bg-violet-600 text-white' : 'bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Moi
            </button>
            <button
              type="button"
              onClick={() => setPayer('other')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                payer === 'other' ? 'bg-violet-600 text-white' : 'bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {other.name}
            </button>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg bg-zinc-800/60 border border-white/10 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors [color-scheme:dark]"
          />
          <button
            type="submit"
            disabled={submitting}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3.5 py-1.5 transition-colors disabled:opacity-50"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            Ajouter
          </button>
        </div>
        <p className="text-[11px] text-zinc-600">
          {payer === 'me'
            ? `Vous avez payé → ${other.name} vous devra ce montant.`
            : `${other.name} a payé → vous lui devrez ce montant.`}
        </p>
      </form>

      {/* Debts list */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden shrink-0">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-zinc-100">Historique des dépenses</h3>
        </div>
        {data.debts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            Aucune dépense pour le moment. Ajoutez-en une ci-dessus.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {data.debts.map((debt) => {
              const otherOwesMe = debt.fromUserId === other.id; // other doit à me
              return (
                <li
                  key={debt.id}
                  className={`flex items-center gap-3 px-4 py-2.5 group ${debt.settled ? 'opacity-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm text-zinc-100 truncate ${debt.settled ? 'line-through' : ''}`}>
                      {debt.description}
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      {fmtDate(debt.date)} ·{' '}
                      {otherOwesMe ? `${other.name} vous doit` : `vous devez à ${other.name}`}
                      {debt.settled && ' · réglé'}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                      otherOwesMe ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {otherOwesMe ? '+' : '−'}
                    {fmtAmount(debt.amount)}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleSettled(debt)}
                      title={debt.settled ? 'Marquer comme non réglé' : 'Marquer comme réglé'}
                      className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                        debt.settled
                          ? 'text-emerald-400 hover:bg-white/10'
                          : 'text-zinc-500 hover:text-emerald-400 hover:bg-white/10'
                      }`}
                    >
                      <CheckCircleIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteDebt(debt)}
                      title="Supprimer"
                      className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-white/10 transition-colors"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Detected transfers between accounts */}
      {transfers.length > 0 && (
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 overflow-hidden shrink-0">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h3 className="text-sm font-semibold text-zinc-100">Virements entre vos comptes</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Transactions détectées automatiquement d'un compte à l'autre.
            </p>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {transfers.map((t) => {
              const meToOther = t.direction === 'me_to_other';
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-100">
                      {meToOther ? `Vous → ${other.name}` : `${other.name} → Vous`}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {fmtDate(t.date)} · {meToOther ? t.myDescription : t.otherDescription}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums text-zinc-300 flex-shrink-0">
                    {fmtAmount(t.amount)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
