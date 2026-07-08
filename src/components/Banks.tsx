import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import type { Bank } from '../types';
import { assetUrl } from '../lib/url';
import {
  PlusIcon,
  EllipsisHorizontalIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const formatIBAN = (iban: string): string => {
  const clean = iban.replace(/\s+/g, '');
  return clean.replace(/(.{4})(?=.)/g, '$1 ');
};

const getAccountTypeInfo = (type: 'CURRENT' | 'SAVINGS' | 'INVESTMENT') => {
  const info: Record<string, { label: string; icon: string }> = {
    CURRENT: { label: 'Compte courant', icon: '💳' },
    SAVINGS: { label: 'Livret d\'épargne', icon: '🏦' },
    INVESTMENT: { label: 'Investissement', icon: '📈' },
  };
  return info[type] || info.CURRENT;
};

interface FormData {
  name: string;
  shortName: string;
  iban: string;
  balance: number | string;
  accountType: 'CURRENT' | 'SAVINGS' | 'INVESTMENT';
  userIds: string[];
  createdAt: string;
}

const emptyForm: FormData = {
  name: '',
  shortName: '',
  iban: '',
  balance: 0,
  accountType: 'CURRENT',
  userIds: [],
  createdAt: new Date().toISOString().split('T')[0],
};

const fmt = (n: number) =>
  `${Math.round(n).toLocaleString('fr-FR')} €`;

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1000000) {
    const v = n / 1000000;
    return `${(Math.round(v * 10) / 10).toLocaleString('fr-FR')} M€`;
  }
  if (abs >= 1000) {
    const v = n / 1000;
    return `${(Math.round(v * 10) / 10).toLocaleString('fr-FR')} k€`;
  }
  return fmt(n);
};

interface EbModal { bankId: string; bankName: string; }
interface EbAspsp { name: string; country: string; logo: string; }

export default function Banks() {
  const { banks, loadBanks, loadTransactions, loadUsers, users } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Enable Banking modal
  const [ebModal, setEbModal] = useState<EbModal | null>(null);
  const [ebStep, setEbStep] = useState<'search' | 'waiting'>('search');
  const [ebSearch, setEbSearch] = useState('');
  const [ebCountry, setEbCountry] = useState('FR');
  const [ebAspsps, setEbAspsps] = useState<EbAspsp[]>([]);
  const [ebLinkUrl, setEbLinkUrl] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await loadUsers();
        await loadBanks();
        await loadTransactions();
      } catch (e) {
        console.error('Error loading:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loadBanks, loadTransactions, loadUsers]);

  useEffect(() => {
    if (!isFormOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeForm();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFormOpen]);

  const openCreate = () => {
    setEditingBank(null);
    setFormData(emptyForm);
    setImageFile(null);
    setImagePreview(null);
    setIsFormOpen(true);
  };

  const openEdit = (bank: Bank) => {
    setOpenMenuId(null);
    setEditingBank(bank);
    setFormData({
      name: bank.name,
      shortName: bank.shortName || '',
      iban: bank.iban || '',
      balance: bank.balance,
      accountType: bank.accountType,
      userIds: (bank.userBanks || []).map((ub) => ub.userId),
      createdAt: bank.createdAt.split('T')[0],
    });
    setImageFile(null);
    setImagePreview(bank.image ? assetUrl(bank.image) : null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingBank(null);
    setFormData(emptyForm);
    setImageFile(null);
    setImagePreview(null);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (evt) => {
        setImagePreview(evt.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.iban || formData.userIds.length === 0) {
      toast.error('Remplissez tous les champs requis et sélectionnez au moins un utilisateur');
      return;
    }

    try {
      const isEdit = editingBank;
      const url = isEdit ? `/api/banks/${isEdit.id}` : '/api/banks';
      const method = isEdit ? 'PUT' : 'POST';

      const bankData = {
        name: formData.name,
        shortName: formData.shortName,
        iban: formData.iban,
        balance: parseFloat(formData.balance.toString()),
        accountType: formData.accountType,
        createdAt: formData.createdAt,
        userIds: formData.userIds,
      };

      const fd = new FormData();
      fd.append('data', JSON.stringify(bankData));
      if (imageFile) {
        fd.append('image', imageFile);
      }

      const res = await fetch(url, { method, body: fd });
      if (res.ok) {
        await loadBanks();
        toast.success(isEdit ? 'Banque mise à jour' : 'Banque créée');
        closeForm();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur');
      }
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const openEbModal = async (bankId: string, bankName: string) => {
    setEbModal({ bankId, bankName });
    setEbStep('search');
    setEbSearch('');
    setEbAspsps([]);
    try {
      const res = await fetch(`/api/enablebanking/aspsps?country=${ebCountry}`);
      if (!res.ok) throw new Error();
      setEbAspsps(await res.json());
    } catch {
      toast.error('Impossible de charger la liste Enable Banking');
    }
  };

  const handleEbLink = async (aspspName: string, aspspCountry: string) => {
    if (!ebModal) return;
    try {
      const res = await fetch('/api/enablebanking/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankId: ebModal.bankId, aspspName, aspspCountry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEbLinkUrl(data.link);
      setEbStep('waiting');
      window.open(data.link, '_blank');
      // Poll for status
      const poll = setInterval(async () => {
        try {
          const sr = await fetch(`/api/enablebanking/banks/${ebModal.bankId}/status`);
          const sd = await sr.json();
          if (sd.ebStatus === 'LINKED') {
            clearInterval(poll);
            await loadBanks();
            setEbModal(null);
            toast.success('Compte lié avec succès !');
          }
        } catch {}
      }, 3000);
    } catch (e: any) {
      toast.error(e.message || 'Erreur Enable Banking');
    }
  };

  const handleDelete = async (bankId: string) => {
    setOpenMenuId(null);
    if (!confirm('Supprimer cette banque ?')) return;

    try {
      const res = await fetch(`/api/banks/${bankId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadBanks();
        toast.success('Banque supprimée');
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500" />
      </div>
    );
  }

  const totalBalance = banks.reduce((sum, b) => sum + b.balance, 0);
  const stats = [
    { label: 'Comptes', value: banks.length.toString(), icon: '🏦' },
    { label: 'Solde total', value: fmtCompact(totalBalance), icon: '💰' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto custom-scrollbar pb-2">
      {/* ── Header (compact) ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Banques</h2>
          {banks.length > 0 && (
            <span className="text-xs font-medium text-zinc-500">
              {banks.length} compte{banks.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3 py-1.5 transition-colors flex-shrink-0"
        >
          <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
          <span className="hidden sm:inline">Nouveau compte</span>
        </button>
      </div>

      {/* ── KPI bar ── */}
      {banks.length > 0 && (
        <div className="grid grid-cols-2 rounded-xl bg-white/[0.04] border border-white/[0.08] divide-x divide-white/[0.06] overflow-hidden">
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
      {banks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 py-16 text-center">
          <div className="h-11 w-11 rounded-xl bg-violet-500/10 flex items-center justify-center text-lg">
            🏦
          </div>
          <p className="mt-4 text-sm font-medium text-zinc-300">Aucun compte bancaire</p>
          <p className="mt-1 text-xs text-zinc-500">
            Connectez votre première banque pour commencer à tracker vos finances.
          </p>
          <button
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3.5 py-2 transition-colors"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            Nouveau compte
          </button>
        </div>
      ) : (
        /* ── Grid of compact bank cards ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
          {banks.map((bank) => {
            const typeInfo = getAccountTypeInfo(bank.accountType);
            const displayIban = bank.iban ? formatIBAN(bank.iban).slice(-15) : '—';

            return (
              <div
                key={bank.id}
                className="group relative rounded-2xl bg-white/[0.04] border border-white/[0.08] p-4 transition-all duration-200 hover:border-white/[0.16] hover:bg-white/[0.06]"
              >
                {/* User avatars (bottom right) — only if multiple users */}
                {users.length > 1 && bank.users && bank.users.length > 0 && (
                  <div className="absolute bottom-3 right-3 flex items-center -space-x-2">
                    {bank.users.map((user) => (
                      <div
                        key={user.id}
                        title={user.name}
                        className="h-6 w-6 rounded-full border border-zinc-800 overflow-hidden flex-shrink-0 ring-1 ring-zinc-950"
                      >
                        {user.avatar ? (
                          <img
                            src={assetUrl(user.avatar)}
                            alt={user.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-violet-600 flex items-center justify-center text-[10px] font-bold text-white">
                            {user.name[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Row 1 — image + name + short name + menu */}
                <div className="flex items-center gap-2.5">
                  {/* Bank image */}
                  {bank.image ? (
                    <img
                      src={assetUrl(bank.image)}
                      alt={bank.name}
                      className="h-8 w-8 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0 text-sm">
                      🏦
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-zinc-50 truncate">
                      {bank.name}
                    </h3>
                    {bank.shortName && (
                      <span className="text-xs text-zinc-500 flex-shrink-0">{bank.shortName}</span>
                    )}
                  </div>

                  {/* Menu button */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === bank.id ? null : bank.id);
                      }}
                      className={`h-6 w-6 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-all ${
                        openMenuId === bank.id ? 'opacity-100 bg-white/10 text-zinc-100' : 'opacity-100'
                      }`}
                      title="Actions"
                    >
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                    </button>

                    {openMenuId === bank.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 top-7 z-20 w-52 rounded-lg bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden py-1">
                          <button
                            onClick={() => { setOpenMenuId(null); openEbModal(bank.id, bank.name); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                          >
                            <LinkIcon className="h-4 w-4 text-violet-400" />
                            <span>Lier</span>
                            {bank.ebStatus === 'LINKED' && (
                              <span className="ml-auto text-[10px] text-green-400 font-medium">✓</span>
                            )}
                            {bank.ebStatus === 'PENDING' && (
                              <span className="ml-auto text-[10px] text-amber-400 font-medium">⏳</span>
                            )}
                          </button>
                          <button
                            onClick={() => openEdit(bank)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                          >
                            <PencilSquareIcon className="h-4 w-4 text-zinc-500" />
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDelete(bank.id)}
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

                {/* Row 2 — account type (subtitle) */}
                <div className="mt-1 text-xs text-zinc-500">
                  {typeInfo.label}
                </div>

                {/* Row 3 — balance (emphasis) */}
                <div className="mt-2 text-lg font-bold text-zinc-50 tabular-nums">
                  {fmtCompact(bank.balance)}
                </div>

                {/* Row 4 — IBAN compact */}
                <div className="mt-2 text-[10px] text-zinc-500 font-mono tabular-nums">
                  {displayIban}
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
                {editingBank ? 'Modifier le compte' : 'Nouveau compte'}
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
              {/* Logo upload */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Logo <span className="text-zinc-600">(optionnel)</span>
                </label>
                <div className="flex items-center gap-3">
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="text-xs text-zinc-400 file:mr-2 file:px-2 file:py-1 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-violet-600/20 file:text-violet-300 hover:file:bg-violet-600/30 cursor-pointer"
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nom du compte
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors"
                  placeholder="Crédit Agricole Courant"
                  autoFocus
                  required
                />
              </div>

              {/* Short name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nom court <span className="text-zinc-600">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={formData.shortName}
                  onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors"
                  placeholder="CA"
                />
              </div>

              {/* IBAN */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  IBAN
                </label>
                <input
                  type="text"
                  value={formData.iban}
                  onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors font-mono text-xs"
                  placeholder="FR1420041010050500013M02606"
                  required
                />
              </div>

              {/* Account type */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CURRENT', 'SAVINGS', 'INVESTMENT'] as const).map((type) => {
                    const info = getAccountTypeInfo(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormData({ ...formData, accountType: type })}
                        className={`text-center py-2 px-3 rounded-lg border transition-colors ${
                          formData.accountType === type
                            ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                            : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300'
                        }`}
                      >
                        <div className="text-lg">{info.icon}</div>
                        <div className="text-xs font-medium mt-0.5">{info.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Balance */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Solde initial
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.balance}
                    onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                    className="w-full rounded-lg bg-zinc-800/60 border border-white/10 pl-3 pr-7 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors tabular-nums"
                    placeholder="1000.00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                    €
                  </span>
                </div>
              </div>

              {/* Users (multi-select simplified) */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Utilisateurs autorisés
                </label>
                <div className="space-y-1">
                  {users.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          userIds: prev.userIds.includes(user.id)
                            ? prev.userIds.filter((id) => id !== user.id)
                            : [...prev.userIds, user.id],
                        }));
                      }}
                      className={`w-full text-left py-1.5 px-2.5 rounded-lg border text-sm transition-colors ${
                        formData.userIds.includes(user.id)
                          ? 'bg-violet-600/20 border-violet-500/50 text-zinc-50'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-300'
                      }`}
                    >
                      ✓ {user.name}
                    </button>
                  ))}
                </div>
                {formData.userIds.length === 0 && (
                  <p className="text-xs text-red-400 mt-1">
                    Sélectionnez au moins un utilisateur
                  </p>
                )}
              </div>

              {/* Created date */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Date de création
                </label>
                <input
                  type="date"
                  value={formData.createdAt}
                  onChange={(e) => setFormData({ ...formData, createdAt: e.target.value })}
                  className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors [color-scheme:dark]"
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
                {editingBank ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Enable Banking modal ── */}
      {ebModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEbModal(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-semibold text-zinc-50">Connecter Enable Banking</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{ebModal.bankName}</p>
              </div>
              <button
                onClick={() => setEbModal(null)}
                className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {ebStep === 'search' ? (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={ebSearch}
                      onChange={(e) => setEbSearch(e.target.value)}
                      placeholder="Rechercher une banque…"
                      className="flex-1 rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none"
                      autoFocus
                    />
                    <select
                      value={ebCountry}
                      onChange={(e) => { setEbCountry(e.target.value); openEbModal(ebModal.bankId, ebModal.bankName); }}
                      className="rounded-lg bg-zinc-800/60 border border-white/10 px-2 py-2 text-sm text-zinc-100 outline-none [color-scheme:dark]"
                    >
                      {['FR','DE','ES','IT','BE','NL','PT','LU'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {ebAspsps.length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-4">Chargement…</p>
                    )}
                    {ebAspsps
                      .filter(a => !ebSearch || a.name.toLowerCase().includes(ebSearch.toLowerCase()))
                      .map((aspsp) => (
                        <button
                          key={aspsp.name}
                          onClick={() => handleEbLink(aspsp.name, aspsp.country)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                        >
                          {aspsp.logo && (
                            <img src={aspsp.logo} alt="" className="h-6 w-6 rounded object-contain" />
                          )}
                          <span className="truncate">{aspsp.name}</span>
                          <span className="ml-auto text-xs text-zinc-600">{aspsp.country}</span>
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <LinkIcon className="h-10 w-10 text-violet-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-zinc-50">Autorisation en cours</p>
                  <p className="text-xs text-zinc-500 mt-1 mb-4">
                    Complétez l'authentification dans la fenêtre ouverte, puis revenez ici.
                  </p>
                  {ebLinkUrl && (
                    <a
                      href={ebLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-violet-400 hover:text-violet-300 underline"
                    >
                      Rouvrir le lien
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
