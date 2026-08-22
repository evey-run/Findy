import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { openUrl } from '@tauri-apps/plugin-opener';
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
  ArrowPathIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  BanknotesIcon,
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

/** Ouvre l'autorisation PSD2 dans le navigateur système sous Tauri. */
async function openAuthenticationUrl(url: string): Promise<void> {
  const target = new URL(url);
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error('Le lien d’autorisation bancaire est invalide.');
  }

  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || window.location.protocol === 'tauri:');

  if (isTauri) {
    // `window.open` n'ouvre pas de navigateur externe dans la WebView macOS.
    // Le plugin Opener délègue explicitement l'URL HTTPS au navigateur système.
    await openUrl(target.toString());
    return;
  }

  const opened = window.open(target.toString(), '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('Le navigateur a bloqué l’ouverture du lien bancaire.');
}

/** `spendable` non renseigné : on retombe sur le type de compte. */
function spendableForBank(bank: Bank): boolean {
  return bank.spendable ?? bank.accountType === 'CURRENT';
}

export default function Banks() {
  const { banks, loadBanks, loadTransactions, loadUsers, users, authUser } = useAppStore();
  const navigate = useNavigate();
  // Le « Moi » est le profil connecté : plus rien à choisir ici.
  const meId = authUser?.id ?? users.find((u) => u.isMe)?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Member creation
  const [isMemberFormOpen, setIsMemberFormOpen] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [isSavingMember, setIsSavingMember] = useState(false);

  // Enable Banking modal
  const [ebModal, setEbModal] = useState<EbModal | null>(null);
  const [ebStep, setEbStep] = useState<'search' | 'waiting'>('search');
  const [ebSearch, setEbSearch] = useState('');
  const [ebCountry, setEbCountry] = useState('FR');
  const [ebAspsps, setEbAspsps] = useState<EbAspsp[]>([]);
  const [ebLinkUrl, setEbLinkUrl] = useState('');
  const [ebLoading, setEbLoading] = useState(false);
  const [ebTunnelUrl, setEbTunnelUrl] = useState('');
  const ebPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ebPollBankIdRef = useRef<string | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (ebPollRef.current) clearInterval(ebPollRef.current);
    };
  }, []);

  // Sync state
  const [syncingBankId, setSyncingBankId] = useState<string | null>(null);
  const [autoSyncingBanks, setAutoSyncingBanks] = useState<Set<string>>(new Set());
  const [syncStatus, setSyncStatus] = useState<Record<string, { lastSyncAt?: string | null; consentDaysRemaining?: number | null; consentWarning?: string | null }>>({});

  // Delete confirmation modal
  const [deleteModal, setDeleteModal] = useState<{ bankId: string; bankName: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      // `bank.balance` est le solde *calculé* (initial + mouvements). Le réinjecter
      // ici puis l'enregistrer doublerait les mouvements — on édite le solde initial.
      balance: bank.initialBalance ?? bank.balance,
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

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) return;
    setIsSavingMember(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: memberName.trim() }),
      });
      if (res.ok) {
        await loadUsers();
        toast.success('Membre ajouté');
        setIsMemberFormOpen(false);
        setMemberName('');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || 'Erreur');
      }
    } catch {
      toast.error('Erreur lors de la création');
    } finally {
      setIsSavingMember(false);
    }
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
        toast.success(isEdit ? 'Portefeuille mis à jour' : 'Portefeuille créé');
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

  // Enable Banking non configuré → rediriger vers les Paramètres au lieu
  // d'ouvrir un parcours qui échouera aussitôt.
  const ensureEbConfigured = async (): Promise<boolean> => {
    try {
      const confRes = await fetch('/api/enablebanking/configured');
      const confData = await confRes.json().catch(() => ({ configured: false }));
      if (!confData?.configured) {
        toast.error('Enable Banking n\'est pas configuré. Renseignez vos identifiants dans les Paramètres.');
        navigate('/settings?setup=enablebanking');
        return false;
      }
      return true;
    } catch {
      navigate('/settings?setup=enablebanking');
      return false;
    }
  };

  const openEbModal = async (bankId: string, bankName: string, country: string = ebCountry) => {
    if (!(await ensureEbConfigured())) return;

    setEbModal({ bankId, bankName });
    setEbStep('search');
    setEbSearch('');
    setEbAspsps([]);
    setEbLoading(true);

    // Fetch tunnel URL for redirect URI display
    fetch('/api/tunnel')
      .then(r => r.json())
      .then(d => setEbTunnelUrl(d.publicUrl || ''))
      .catch(() => {});

    try {
      const res = await fetch(`/api/enablebanking/aspsps?country=${country}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Format de réponse invalide');
      }
      setEbAspsps(data);
    } catch (err: any) {
      console.error('Error loading ASPSPs:', err);
      toast.error(err.message || 'Impossible de charger la liste Enable Banking');
      closeEbModal();
    } finally {
      setEbLoading(false);
    }
  };

  const stopEbPolling = useCallback(() => {
    if (ebPollRef.current) {
      clearInterval(ebPollRef.current);
      ebPollRef.current = null;
    }
    ebPollBankIdRef.current = null;
  }, []);

  // `target` permet de relancer une liaison sans passer par la recherche de
  // banque : le renouvellement de consentement réutilise l'ASPSP déjà connu.
  const handleEbLink = async (aspspName: string, aspspCountry: string, target?: EbModal) => {
    const bank = target ?? ebModal;
    if (!bank) return;
    try {
      const res = await fetch('/api/enablebanking/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankId: bank.bankId, aspspName, aspspCountry }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEbLinkUrl(data.link);
      setEbStep('waiting');
      ebPollBankIdRef.current = bank.bankId;

      try {
        await openAuthenticationUrl(data.link);
      } catch (error) {
        console.error('Impossible d’ouvrir le navigateur pour Enable Banking:', error);
        toast.error('Impossible d’ouvrir le navigateur. Utilisez « Rouvrir » ou copiez le lien ci-dessous.');
      }

      // Poll for status — max 10 minutes, every 3s. Une sélection de compte
      // après le consentement (ou une validation bancaire forte) peut prendre
      // plus de deux minutes.
      const MAX_POLLS = 200; // 200 × 3s = 10 minutes
      let polls = 0;
      ebPollRef.current = setInterval(async () => {
        polls++;
        if (polls > MAX_POLLS) {
          stopEbPolling();
          toast.error('Timeout — réessayez en cliquant sur le lien');
          return;
        }
        try {
          const sr = await fetch(`/api/enablebanking/banks/${ebPollBankIdRef.current}/status`);
          const sd = await sr.json();
          if (sd.ebStatus === 'LINKED') {
            stopEbPolling();
            await loadBanks();
            await loadTransactions({ forceRefresh: true });
            closeEbModal();
            toast.success('Compte lié avec succès !');
          }
        } catch {}
      }, 3000);
    } catch (e: any) {
      toast.error(e.message || 'Erreur Enable Banking');
    }
  };

  /**
   * Renouvellement du consentement : la banque est déjà connue, on repart
   * directement sur son autorisation au lieu de refaire le parcours de
   * recherche. Sans ASPSP mémorisé, on retombe sur le parcours complet.
   */
  const handleEbRenew = async (bank: Bank) => {
    if (!bank.ebAspspName || !bank.ebAspspCountry) {
      await openEbModal(bank.id, bank.name);
      return;
    }
    if (!(await ensureEbConfigured())) return;

    const target = { bankId: bank.id, bankName: bank.name };
    setEbModal(target);
    setEbStep('waiting');
    setEbLinkUrl('');
    await handleEbLink(bank.ebAspspName, bank.ebAspspCountry, target);
  };

  const closeEbModal = useCallback(() => {
    stopEbPolling();
    setEbModal(null);
  }, [stopEbPolling]);

  /**
   * Compter ou non ce compte dans le reste à vivre.
   *
   * Une banque déclare parfois un livret comme compte courant : ses 12 000 €
   * d'épargne gonflent alors le chiffre affiché sur le tableau de bord. Ce
   * réglage prime sur le type de compte.
   */
  const toggleSpendable = async (bank: Bank) => {
    setOpenMenuId(null);
    const next = spendableForBank(bank) ? false : true;
    try {
      const res = await fetch(`/api/banks/${bank.id}/spendable`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spendable: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Modification impossible');
      await loadBanks();
      toast.success(next ? `${bank.name} compte dans le reste à vivre` : `${bank.name} en est exclu`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Modification impossible');
    }
  };

  const handleDelete = async (bankId: string, bankName: string) => {
    setOpenMenuId(null);
    setDeleteModal({ bankId, bankName });
  };

  const confirmDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/banks/${deleteModal.bankId}`, { method: 'DELETE' });
      if (res.ok) {
        await loadBanks();
        await loadTransactions({ forceRefresh: true });
        toast.success('Portefeuille supprimé');
        setDeleteModal(null);
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  // ── Sync handlers ──

  const loadSyncStatuses = async () => {
    const statuses: Record<string, any> = {};
    // Le serveur bascule lui-même un consentement échu en EXPIRED : il faut
    // alors rafraîchir les comptes pour afficher le bouton de renouvellement.
    let statusChanged = false;

    for (const bank of banks) {
      if (!bank.ebStatus || bank.ebStatus !== 'LINKED') continue;
      try {
        const res = await fetch(`/api/enablebanking/banks/${bank.id}/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.ebStatus && data.ebStatus !== bank.ebStatus) statusChanged = true;
          statuses[bank.id] = {
            lastSyncAt: data.ebLastSyncAt,
            consentDaysRemaining: data.consentDaysRemaining,
            consentWarning: data.consentWarning,
          };
        }
      } catch {}
    }
    setSyncStatus(statuses);
    if (statusChanged) await loadBanks();
  };

  const handleSync = async (bankId: string) => {
    if (syncingBankId) return;
    setSyncingBankId(bankId);
    try {
      const res = await fetch(`/api/enablebanking/banks/${bankId}/sync-manual`, { method: 'POST' });
      const data = await res.json();

      if (res.status === 429) {
        toast.error(data.message || 'Patientez avant de resynchroniser');
        return;
      }
      if (res.status === 403 && data.error === 'CONSENT_EXPIRED') {
        toast.error('Consentement expiré. Réauthentifiez votre compte bancaire.');
        return;
      }
      if (res.status === 403 && data.error === 'SESSION_EXPIRED') {
        toast.error(data.message || 'Session expirée. Cliquez sur « Lier » pour réauthentifier.', { duration: 6000 });
        await loadBanks();
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || `Erreur ${res.status}`);
      }

      const msg = `Sync OK : +${data.imported} nouvelles, ${data.pendingReconciled} réconciliées`;
      toast.success(msg);

      // Refresh data
      await loadTransactions({ forceRefresh: true });
      await loadSyncStatuses();
    } catch (err: any) {
      toast.error(err.message || 'Erreur de synchronisation');
    } finally {
      setSyncingBankId(null);
    }
  };

  // Auto-sync on mount if any bank hasn't synced in 6h
  const autoSyncTriggered = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (banks.length === 0) return;
    const THRESHOLD_MS = 6 * 60 * 60 * 1000;
    const now = Date.now();
    const banksToSync: { id: string; name: string }[] = [];

    for (const bank of banks) {
      if (bank.ebStatus === 'EXPIRED') continue;
      if (bank.ebStatus !== 'LINKED' || !bank.ebAccountUid) continue;
      if (autoSyncTriggered.current.has(bank.id)) continue;
      const lastSync = bank.ebLastSyncAt ? new Date(bank.ebLastSyncAt).getTime() : 0;
      if (now - lastSync > THRESHOLD_MS) {
        banksToSync.push({ id: bank.id, name: bank.name });
      }
    }

    if (banksToSync.length === 0) return;

    // Show loading state
    setAutoSyncingBanks(new Set(banksToSync.map((b) => b.id)));

    for (const bank of banksToSync) {
      autoSyncTriggered.current.add(bank.id);
      console.log(`[Sync] Auto-syncing ${bank.name}...`);

      fetch(`/api/enablebanking/banks/${bank.id}/sync`, { method: 'POST' })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) {
            if (data.error === 'CONSENT_EXPIRED') {
              toast.error(`${bank.name} : consentement expiré`, { duration: 5000 });
            } else if (data.error === 'SESSION_EXPIRED') {
              toast.error(`${bank.name} : ${data.message || 'Session expirée. Cliquez sur « Lier ».'}`, { duration: 6000 });
              await loadBanks();
            } else {
              toast.error(`Sync ${bank.name} : ${data.error || data.message || 'Erreur'}`, { duration: 5000 });
              console.error(`[Sync] ${bank.name} failed:`, data);
            }
            return;
          }
          if (data.imported > 0 || data.pendingReconciled > 0) {
            toast.success(`${bank.name} : +${data.imported} nouvelles, ${data.pendingReconciled} réconciliées`, { duration: 4000 });
          } else {
            console.log(`[Sync] ${bank.name} : no new transactions`);
          }
          await loadTransactions({ forceRefresh: true });
          await loadSyncStatuses();
        })
        .catch((err) => {
          console.error(`[Sync] ${bank.name} error:`, err);
        })
        .finally(() => {
          setAutoSyncingBanks((prev) => {
            const next = new Set(prev);
            next.delete(bank.id);
            return next;
          });
        });
    }
  }, [banks, loadTransactions]);

  // Load sync statuses when banks change
  useEffect(() => {
    loadSyncStatuses();
  }, [banks]);

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
      <div className="flex-shrink-0 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Portefeuille</h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {users.length === 0 && (
            <button
              onClick={() => setIsMemberFormOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-zinc-300 text-sm font-medium px-3 py-1.5 transition-colors"
            >
              <UserGroupIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Ajouter un membre</span>
            </button>
          )}
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-3 py-1.5 transition-colors"
          >
            <PlusIcon className="h-4 w-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Nouveau compte</span>
          </button>
        </div>
      </div>

      {/* ── Global sync indicator ── */}
      {autoSyncingBanks.size > 0 && (
        <div className="flex-shrink-0 flex items-center gap-2 rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-2.5 text-sm text-violet-300">
          <ArrowPathIcon className="h-4 w-4 animate-spin flex-shrink-0" />
          <span>
            Synchronisation en cours…
            {autoSyncingBanks.size > 1 && ` (${autoSyncingBanks.size} comptes)`}
          </span>
        </div>
      )}

      {/* ── Famille (avatars) ── */}
      {users.length > 0 && (
        <div className="flex-shrink-0">
          <div className="flex items-start gap-4 flex-wrap">
            {users.map((user) => {
              const isMe = user.id === meId;
              const handleClick = () => {
                if (isMe) return;
                navigate(`/tricount/${user.id}`);
              };
              return (
                <div key={user.id} className="flex flex-col items-center gap-1 w-16">
                  <button
                    type="button"
                    onClick={handleClick}
                    title={isMe ? 'Vous' : `Tricount avec ${user.name}`}
                    className="relative group"
                  >
                    {user.avatar ? (
                      <img
                        src={assetUrl(user.avatar)}
                        alt={user.name}
                        className={`w-11 h-11 rounded-full object-cover ring-2 transition-all ${
                          isMe ? 'ring-violet-500' : 'ring-white/10 group-hover:ring-violet-400/60'
                        }`}
                      />
                    ) : (
                      <div
                        className={`w-11 h-11 rounded-full bg-zinc-700 flex items-center justify-center text-white text-sm font-bold ring-2 transition-all ${
                          isMe ? 'ring-violet-500' : 'ring-white/10 group-hover:ring-violet-400/60'
                        }`}
                      >
                        {user.name ? user.name[0].toUpperCase() : '?'}
                      </div>
                    )}
                  </button>
                  <span className={`text-[10px] truncate max-w-[64px] ${isMe ? 'text-violet-300' : 'text-zinc-400'}`}>
                    {user.name}
                  </span>
                </div>
              );
            })}
            <button
              onClick={() => setIsMemberFormOpen(true)}
              className="flex flex-col items-center gap-1 w-16"
            >
              <div className="w-11 h-11 rounded-full border-2 border-dashed border-zinc-600 hover:border-violet-500/60 flex items-center justify-center text-zinc-500 hover:text-violet-400 transition-colors">
                <PlusIcon className="h-4 w-4" />
              </div>
              <span className="text-[10px] text-zinc-500">Ajouter</span>
            </button>
          </div>
        </div>
      )}

      {/* ── KPI bar ── */}
      {banks.length > 0 && (
        <div className="flex-shrink-0 grid grid-cols-2 rounded-xl bg-white/[0.04] border border-white/[0.08] divide-x divide-white/[0.06] overflow-hidden">
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
            Connectez votre premier portefeuille pour commencer à tracker vos finances.
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
                className="group relative rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.05]"
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

                  {/* Sync spinner (auto-sync in progress) */}
                  {(autoSyncingBanks.has(bank.id) || syncingBankId === bank.id) && (
                    <div className="flex-shrink-0" title="Synchronisation en cours…">
                      <ArrowPathIcon className="h-4 w-4 text-violet-400 animate-spin" />
                    </div>
                  )}

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
                            <LinkIcon className={`h-4 w-4 ${bank.ebStatus === 'EXPIRED' ? 'text-amber-400' : 'text-violet-400'}`} />
                            <span>{bank.ebStatus === 'EXPIRED' ? 'Relier' : 'Lier'}</span>
                            <button
                            onClick={() => toggleSpendable(bank)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                            title="Inclure ou non ce compte dans le reste à vivre du tableau de bord"
                          >
                            <BanknotesIcon className={`h-4 w-4 ${spendableForBank(bank) ? 'text-violet-400' : 'text-zinc-600'}`} />
                            <span>Reste à vivre</span>
                            <span className={`ml-auto text-[10px] font-medium ${spendableForBank(bank) ? 'text-green-400' : 'text-zinc-500'}`}>
                              {spendableForBank(bank) ? 'compté' : 'exclu'}
                            </span>
                          </button>
                          {bank.ebStatus === 'LINKED' && (
                              <span className="ml-auto text-[10px] text-green-400 font-medium">✓</span>
                            )}
                            {bank.ebStatus === 'PENDING' && (
                              <span className="ml-auto text-[10px] text-amber-400 font-medium">⏳</span>
                            )}
                            {bank.ebStatus === 'EXPIRED' && (
                              <span className="ml-auto text-[10px] text-amber-400 font-medium">⚠</span>
                            )}
                          </button>
                          {bank.ebStatus === 'LINKED' && (
                            <button
                              onClick={() => { setOpenMenuId(null); handleSync(bank.id); }}
                              disabled={syncingBankId === bank.id}
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors disabled:opacity-40"
                            >
                              <ArrowPathIcon className={`h-4 w-4 text-emerald-400 ${syncingBankId === bank.id ? 'animate-spin' : ''}`} />
                              <span>{syncingBankId === bank.id ? 'Sync en cours…' : 'Synchroniser'}</span>
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(bank)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
                          >
                            <PencilSquareIcon className="h-4 w-4 text-zinc-500" />
                            Modifier
                          </button>
                          <button
                            onClick={() => handleDelete(bank.id, bank.name)}
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

                {/* Row 5 — Sync status & consent warning */}
                {bank.ebStatus === 'EXPIRED' && (
                  <button
                    type="button"
                    onClick={() => handleEbRenew(bank)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-[10px] font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-md px-1.5 py-1.5 transition-colors"
                  >
                    <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" />
                    <span>Connexion bancaire expirée — renouveler</span>
                  </button>
                )}
                {bank.ebStatus === 'LINKED' && syncStatus[bank.id] && (
                  <div className="mt-2 space-y-1">
                    {syncStatus[bank.id].lastSyncAt && (
                      <div className="text-[10px] text-zinc-600">
                        Sync: {new Date(syncStatus[bank.id].lastSyncAt!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {syncStatus[bank.id].consentWarning && (
                      <button
                        type="button"
                        onClick={() => handleEbRenew(bank)}
                        title={syncStatus[bank.id].consentWarning ?? undefined}
                        className="w-full flex items-center justify-center gap-1.5 text-[10px] font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-md px-1.5 py-1 transition-colors"
                      >
                        <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">
                          Expire dans {syncStatus[bank.id].consentDaysRemaining}j — renouveler
                        </span>
                      </button>
                    )}
                  </div>
                )}
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeEbModal} />
          <div className="relative w-full max-w-md rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-semibold text-zinc-50">Connecter Enable Banking</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{ebModal.bankName}</p>
              </div>
              <button
                onClick={closeEbModal}
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
                      placeholder="Rechercher un portefeuille…"
                      className="flex-1 rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none"
                      autoFocus
                    />
                    <select
                      value={ebCountry}
                      onChange={(e) => {
                        const newCountry = e.target.value;
                        setEbCountry(newCountry);
                        if (ebModal) openEbModal(ebModal.bankId, ebModal.bankName, newCountry);
                      }}
                      className="rounded-lg bg-zinc-800/60 border border-white/10 px-2 py-2 text-sm text-zinc-100 outline-none [color-scheme:dark]"
                    >
                      {['FR','DE','ES','IT','BE','NL','PT','LU'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  {ebTunnelUrl && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5">
                      <p className="text-[10px] text-amber-300/80 mb-1">
                        Si c'est votre première fois, ajoutez cette URL dans Enable Banking → Redirect URIs :
                      </p>
                      <div className="flex items-center gap-1.5">
                        <code className="flex-1 text-[10px] text-zinc-300 bg-black/30 rounded px-2 py-1 truncate select-all">
                          {ebTunnelUrl}/api/enablebanking/callback
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${ebTunnelUrl}/api/enablebanking/callback`);
                            toast.success('URL copiée');
                          }}
                          className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                          title="Copier"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {ebLoading && (
                      <div className="flex justify-center items-center py-4">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-500" />
                      </div>
                    )}
                    {!ebLoading && ebAspsps.length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-4">Aucun portefeuille trouvé</p>
                    )}
                    {!ebLoading && ebAspsps
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
                  <div className="animate-spin rounded-full h-10 w-10 border-2 border-violet-500/30 border-t-violet-500 mx-auto mb-3" />
                  <p className="text-sm font-medium text-zinc-50">Autorisation en cours</p>
                  <p className="text-xs text-zinc-500 mt-1 mb-4">
                    Complétez l'authentification dans la fenêtre ouverte.<br />
                    Si plusieurs comptes sont autorisés, choisissez ensuite celui à synchroniser.<br />
                    La liaison sera détectée automatiquement.
                  </p>
                  {ebLinkUrl && (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={() => {
                          openAuthenticationUrl(ebLinkUrl).catch((error) => {
                            console.error('Impossible de rouvrir le lien Enable Banking:', error);
                            toast.error('Impossible d’ouvrir le navigateur. Copiez le lien à la place.');
                          });
                        }}
                        className="text-xs text-violet-400 hover:text-violet-300 underline"
                      >
                        Rouvrir le lien d'authentification
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(ebLinkUrl)
                            .then(() => toast.success('Lien d’autorisation copié'))
                            .catch(() => toast.error('Impossible de copier le lien d’autorisation'));
                        }}
                        className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                      >
                        Copier le lien d'authentification
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !deleting && setDeleteModal(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <TrashIcon className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-50">Supprimer le compte</h3>
                <p className="text-xs text-zinc-500">{deleteModal.bankName}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-1">
              Voulez-vous vraiment supprimer ce compte bancaire ?
            </p>
            <p className="text-sm text-red-400 font-medium mb-5">
              Toutes les transactions associées seront définitivement supprimées.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-600 hover:bg-red-500 px-3.5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white" />
                    Suppression…
                  </>
                ) : (
                  'Supprimer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add member modal ── */}
      {isMemberFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setIsMemberFormOpen(false); setMemberName(''); }} />
          <form
            onSubmit={handleCreateMember}
            className="relative w-full max-w-sm rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <h3 className="text-base font-semibold text-zinc-50">Ajouter un membre</h3>
              <button
                type="button"
                onClick={() => { setIsMemberFormOpen(false); setMemberName(''); }}
                className="h-7 w-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-white/10 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nom</label>
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="w-full rounded-lg bg-zinc-800/60 border border-white/10 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/40 outline-none transition-colors"
                placeholder="Prénom"
                autoFocus
                required
                maxLength={20}
              />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => { setIsMemberFormOpen(false); setMemberName(''); }}
                className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSavingMember || !memberName.trim()}
                className="rounded-lg bg-violet-600 hover:bg-violet-500 px-3.5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingMember ? '...' : 'Ajouter'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
