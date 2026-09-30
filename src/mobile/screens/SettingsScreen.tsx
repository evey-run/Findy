import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CameraIcon,
  CpuChipIcon,
  EyeSlashIcon,
  KeyIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { useAppStore } from '../../store';
import type { Space } from '../../types';
import { assetUrl } from '../../lib/url';
import { toISODate } from '../../lib/format';
import { ScreenBody, ScreenHeader } from '../components/Screen';
import { ListCard } from '../components/ListRow';
import { Field, SettingRow, TextInput } from '../components/Field';
import { Chip, DangerButton, PrimaryButton, Toggle } from '../components/Controls';
import { SkeletonList } from '../components/Feedback';
import Sheet from '../components/Sheet';
import Avatar from '../components/Avatar';
import { cx, radii, surfaces } from '../theme';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const HIDDEN_STORAGE_KEY = 'findy-balance-hidden';

type Tab = 'compte' | 'espaces' | 'affichage' | 'donnees' | 'ia';

const TABS: { id: Tab; label: string }[] = [
  { id: 'compte', label: 'Compte' },
  { id: 'espaces', label: 'Espaces' },
  { id: 'affichage', label: 'Affichage' },
  { id: 'donnees', label: 'Données' },
  { id: 'ia', label: 'IA' },
];

export default function SettingsScreen() {
  const { spaces, loadUsers, loadSpaces } = useAppStore();

  const [tab, setTab] = useState<Tab>('compte');
  const [ready, setReady] = useState(spaces.length > 0);

  useEffect(() => {
    void Promise.all([loadUsers(), loadSpaces()]).finally(() => setReady(true));
  }, [loadUsers, loadSpaces]);

  return (
    <>
      <ScreenHeader title="Réglages" back backTo="/more" />

      {/* ── Onglets ── */}
      <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-white/[0.06] px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              'shrink-0 px-3 py-2.5 text-[13px] font-medium transition-colors',
              tab === t.id ? 'border-b-2 border-violet-400 text-violet-300' : 'text-zinc-500',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ScreenBody>
        {tab === 'compte' && <CompteTab />}
        {tab === 'espaces' && <EspacesTab ready={ready} />}
        {tab === 'affichage' && <AffichageTab />}
        {tab === 'donnees' && <DonneesTab />}
        {tab === 'ia' && <IaTab />}
      </ScreenBody>
    </>
  );
}

// ─── Compte ───────────────────────────────────────────────────────────────

function CompteTab() {
  const { authUser, loadUsers, restoreSession, setPassword } = useAppStore();
  const [uploading, setUploading] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);

  const saveProfile = async (body: FormData): Promise<void> => {
    if (!authUser) return;
    const res = await fetch(`/api/users/${authUser.id}`, { method: 'PUT', body });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Erreur');
    await Promise.all([loadUsers(), restoreSession()]);
  };

  const handleAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Image requise');
    if (file.size > MAX_AVATAR_BYTES) return toast.error('Max 5 Mo');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('avatar', file);
      await saveProfile(body);
      toast.success('Photo mise à jour');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setUploading(false);
    }
  };

  const submitName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      const body = new FormData();
      body.append('name', trimmed);
      await saveProfile(body);
      toast.success('Nom modifié');
      setNameOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingName(false);
    }
  };

  const submitPassword = async (remove: boolean) => {
    if (!authUser) return;
    setSavingPwd(true);
    setPwdError(null);
    try {
      await setPassword(authUser.id, remove ? null : newPwd, currentPwd || undefined);
      setCurrentPwd('');
      setNewPwd('');
      setPasswordOpen(false);
      toast.success(remove ? 'Mot de passe retiré' : 'Mot de passe enregistré');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingPwd(false);
    }
  };

  return (
    <>
      <ListCard>
        <label
          htmlFor="findy-avatar"
          className={cx('tappable flex min-h-[52px] w-full cursor-pointer items-center gap-3 py-2', uploading && 'opacity-50')}
        >
          <span className="relative shrink-0">
            {authUser?.avatar ? (
              <img src={assetUrl(authUser.avatar)} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10" />
            ) : (
              <Avatar label={authUser?.name ?? '?'} color="#7c3aed" className="h-10 w-10" />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 ring-2 ring-[#101014]">
              <CameraIcon className="h-2.5 w-2.5 text-white" />
            </span>
          </span>
          <span className="min-w-0 flex-1 text-[14px] font-medium text-zinc-100">
            {uploading ? 'Envoi…' : 'Photo de profil'}
          </span>
          <input id="findy-avatar" type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={handleAvatar} />
        </label>

        <SettingRow
          icon={<UserIcon className="h-5 w-5" />}
          title="Nom"
          trailing={<Disclosure value={authUser?.name} />}
          onClick={() => { setNameValue(authUser?.name ?? ''); setNameOpen(true); }}
        />

        <SettingRow
          icon={<KeyIcon className="h-5 w-5" />}
          title="Mot de passe"
          trailing={<Disclosure value={authUser?.hasPassword ? 'Défini' : 'Aucun'} />}
          onClick={() => { setCurrentPwd(''); setNewPwd(''); setPwdError(null); setPasswordOpen(true); }}
        />
      </ListCard>

      {/* Feuille : nom */}
      <Sheet open={nameOpen} onClose={() => setNameOpen(false)} title="Nom"
        footer={<PrimaryButton onClick={submitName} disabled={savingName || !nameValue.trim()}>{savingName ? '…' : 'Enregistrer'}</PrimaryButton>}>
        <Field>
          <TextInput placeholder="Votre nom" value={nameValue} onChange={(e) => setNameValue(e.target.value)} maxLength={20} autoCapitalize="words" enterKeyHint="done" />
        </Field>
      </Sheet>

      {/* Feuille : mot de passe */}
      <Sheet open={passwordOpen} onClose={() => setPasswordOpen(false)} title="Mot de passe"
        footer={
          <div className="space-y-2">
            <PrimaryButton onClick={() => submitPassword(false)} disabled={savingPwd || !newPwd}>
              {savingPwd ? '…' : authUser?.hasPassword ? 'Changer' : 'Définir'}
            </PrimaryButton>
            {authUser?.hasPassword && (
              <DangerButton onClick={() => submitPassword(true)} disabled={savingPwd || !currentPwd} className="bg-transparent text-red-400">
                Retirer
              </DangerButton>
            )}
          </div>
        }>
        <div className="space-y-3">
          {authUser?.hasPassword && (
            <Field>
              <TextInput type="password" placeholder="Mot de passe actuel" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" enterKeyHint="next" />
            </Field>
          )}
          <Field error={pwdError ?? undefined}>
            <TextInput type="password" placeholder={authUser?.hasPassword ? 'Nouveau mot de passe' : 'Mot de passe'} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" enterKeyHint="done" />
          </Field>
        </div>
      </Sheet>
    </>
  );
}

// ─── Espaces ──────────────────────────────────────────────────────────────

function EspacesTab({ ready }: { ready: boolean }) {
  const { authUser, users, spaces, createSpace, renameSpace } = useAppStore();
  const [renaming, setRenaming] = useState<Space | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceMembers, setNewSpaceMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const memberChips = useMemo(() => users.filter((u) => u.id !== authUser?.id), [users, authUser?.id]);

  const submitRename = async () => {
    if (!renaming || !renameValue.trim()) return;
    setSavingRename(true);
    try {
      await renameSpace(renaming.id, renameValue.trim());
      toast.success('Renommé');
      setRenaming(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingRename(false);
    }
  };

  const submitCreate = async () => {
    if (!newSpaceName.trim() || newSpaceMembers.length < 2) return;
    setCreating(true);
    try {
      await createSpace(newSpaceName.trim(), newSpaceMembers);
      setNewSpaceName('');
      setNewSpaceMembers(authUser ? [authUser.id] : []);
      setCreateOpen(false);
      toast.success('Groupe créé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  };

  if (!ready) return <SkeletonList rows={2} />;

  return (
    <>
      <ListCard>
        {spaces.map((space) => {
          const shared = space.kind === 'SHARED';
          return (
            <SettingRow
              key={space.id}
              icon={shared ? <UsersIcon className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
              title={space.name}
              subtitle={shared ? (space.members ?? []).map((m) => m.name).join(', ') : undefined}
              trailing={shared ? <Disclosure value="Renommer" /> : <span className="text-[12px] text-zinc-600">Perso</span>}
              onClick={shared ? () => { setRenaming(space); setRenameValue(space.name); } : undefined}
            />
          );
        })}
        <SettingRow
          icon={<PlusIcon className="h-5 w-5" />}
          title="Nouveau groupe"
          trailing={<Disclosure />}
          onClick={() => { setNewSpaceName(''); setNewSpaceMembers(authUser ? [authUser.id] : []); setCreateOpen(true); }}
        />
      </ListCard>

      <Sheet open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Renommer"
        footer={<PrimaryButton onClick={submitRename} disabled={savingRename || !renameValue.trim()}>{savingRename ? '…' : 'Enregistrer'}</PrimaryButton>}>
        <Field>
          <TextInput placeholder="Nom du groupe" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoCapitalize="sentences" enterKeyHint="done" />
        </Field>
      </Sheet>

      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau groupe"
        footer={<PrimaryButton onClick={submitCreate} disabled={creating || !newSpaceName.trim() || newSpaceMembers.length < 2}>{creating ? '…' : 'Créer'}</PrimaryButton>}>
        <div className="space-y-3">
          <Field>
            <TextInput placeholder="Nom du groupe" value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value)} autoCapitalize="sentences" enterKeyHint="done" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Chip label={`${authUser?.name ?? 'Moi'} (vous)`} active />
            {memberChips.map((u) => (
              <Chip key={u.id} label={u.name} active={newSpaceMembers.includes(u.id)}
                onClick={() => setNewSpaceMembers((p) => p.includes(u.id) ? p.filter((id) => id !== u.id) : [...p, u.id])} />
            ))}
          </div>
          {memberChips.length === 0 && <p className="text-[12px] text-zinc-600">Ajoutez des personnes depuis Comptes.</p>}
        </div>
      </Sheet>
    </>
  );
}

// ─── Affichage ────────────────────────────────────────────────────────────

function AffichageTab() {
  const [hiddenBalances, setHiddenBalances] = useState(
    () => typeof localStorage !== 'undefined' && localStorage.getItem(HIDDEN_STORAGE_KEY) === '1',
  );

  const toggle = (value: boolean) => {
    setHiddenBalances(value);
    if (typeof localStorage !== 'undefined') localStorage.setItem(HIDDEN_STORAGE_KEY, value ? '1' : '0');
  };

  return (
    <ListCard>
      <SettingRow
        icon={<EyeSlashIcon className="h-5 w-5" />}
        title="Masquer les soldes"
        trailing={<Toggle checked={hiddenBalances} onChange={toggle} label="Masquer les soldes" />}
      />
    </ListCard>
  );
}

// ─── Données ──────────────────────────────────────────────────────────────

function DonneesTab() {
  const { requestConfirm } = useAppStore();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const exportData = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/settings/export');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const filename = `findy-backup-${toISODate(new Date())}.json`;
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Sauvegarde Findy' }); } catch {}
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export impossible');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const ok = await requestConfirm('Les données du serveur seront remplacées.', { title: 'Importer ?', confirmLabel: 'Importer', danger: true });
    if (!ok) return;
    setImporting(true);
    try {
      const payload = JSON.parse(await file.text());
      const res = await fetch('/api/settings/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Import échoué');
      toast.success('Importé. Rechargement…');
      setTimeout(() => window.location.reload(), 1_600);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import impossible');
      setImporting(false);
    }
  };

  return (
    <>
      <ListCard>
        <SettingRow
          icon={<ArrowDownTrayIcon className="h-5 w-5" />}
          title="Exporter"
          subtitle={exporting ? 'Préparation…' : undefined}
          trailing={<Disclosure />}
          onClick={() => void exportData()}
        />
        <SettingRow
          icon={<ArrowUpTrayIcon className="h-5 w-5" />}
          title="Importer"
          subtitle={importing ? 'Import…' : undefined}
          trailing={<Disclosure />}
          onClick={() => importRef.current?.click()}
        />
      </ListCard>
      <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" onChange={handleImport} />
    </>
  );
}

// ─── IA ───────────────────────────────────────────────────────────────────

function IaTab() {
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorizing, setCategorizing] = useState(false);

  useEffect(() => {
    fetch('/api/settings/ai')
      .then((r) => r.json())
      .then((data) => {
        setEndpoint(data.endpoint || '');
        setApiKey(data.apiKey || '');
        setModel(data.model || '');
        setEnabled(!!data.enabled);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, apiKey, model, enabled }),
      });
      if (!res.ok) throw new Error('Erreur');
      toast.success('Configuration IA enregistrée');
    } catch {
      toast.error('Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }, [endpoint, apiKey, model, enabled]);

  const toggle = useCallback(async (next: boolean) => {
    setEnabled(next);
    try {
      await fetch('/api/settings/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
    } catch {}
  }, []);

  const runCategorize = useCallback(async () => {
    setCategorizing(true);
    try {
      const r = await fetch('/api/settings/ai/categorize', { method: 'POST' });
      const d = await r.json();
      if (d.categorized > 0) toast.success(`${d.categorized} transaction(s) catégorisée(s)`);
      else if (d.errors > 0) toast.error(`${d.errors} erreur(s)`);
      else toast('Aucune transaction à catégoriser');
    } catch {
      toast.error('Erreur de catégorisation');
    } finally {
      setCategorizing(false);
    }
  }, []);

  if (loading) return <SkeletonList rows={3} />;

  return (
    <div className="space-y-4">
      <ListCard>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Catégorisation automatique</p>
            <p className="text-[11px] text-zinc-500">{enabled ? 'Active — les transactions non catégorisées seront analysées' : 'Désactivée'}</p>
          </div>
          <button role="switch" aria-checked={enabled} onClick={() => toggle(!enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-violet-600' : 'bg-white/15'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </ListCard>

      <ListCard>
        <div className="space-y-3 px-4 py-3">
          <Field>
            <TextInput
              placeholder="Endpoint (ex: http://localhost:11434)"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              autoComplete="url"
              inputMode="url"
            />
          </Field>
          <Field>
            <TextInput
              placeholder="Clé API (optionnel)"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field>
            <TextInput
              placeholder="Modèle (ex: llama3, gpt-4o)"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
      </ListCard>

      <div className="px-1 space-y-2">
        <PrimaryButton onClick={save} disabled={saving || !endpoint} className="w-full">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </PrimaryButton>
        <PrimaryButton onClick={runCategorize} disabled={categorizing || !enabled} className="w-full">
          {categorizing ? 'Catégorisation…' : 'Catégoriser maintenant'}
        </PrimaryButton>
      </div>

      <div className={cx(radii.tile, surfaces.card, 'px-4 py-3')}>
        <div className="flex items-start gap-2">
          <CpuChipIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <p className="text-[12px] leading-relaxed text-zinc-500">
            Ollama : lancez <span className="font-mono text-zinc-400">ollama serve</span> puis renseignez <span className="font-mono text-zinc-400">http://localhost:11434</span>.
            OpenAI : mettez votre clé API et choisissez un modèle GPT.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function Disclosure({ value }: { value?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {value && <span className="max-w-[140px] truncate text-[13px] text-zinc-500">{value}</span>}
      <ChevronRightIcon className="h-4 w-4 text-zinc-600" />
    </span>
  );
}
