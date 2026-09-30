import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  TrashIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  PhotoIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  getAutoUpdateEnabled,
  setAutoUpdateEnabled,
  checkForUpdates,
  downloadAndInstallUpdate,
  type VersionInfo,
  type UpdateProgress,
} from '../utils/updates';
import { useAppStore } from '../store';

type Msg = { type: 'success' | 'error'; text: string };
type Tab = 'compte' | 'espaces' | 'sync' | 'donnees' | 'ia';

interface MobileAccess {
  enabled: boolean;
  preference: boolean;
  restartRequired: boolean;
  locked: boolean;
  port: number;
  addresses: string[];
}

interface SyncProvider {
  id: string;
  name: string;
  description: string;
  url: string;
  logo: string;
}

const SYNC_PROVIDERS: SyncProvider[] = [
  { id: 'enablebanking', name: 'Enable Banking', description: 'Open Banking API pour l\'Europe.', url: 'https://enablebanking.com', logo: '🏦' },
  { id: 'gocardless', name: 'GoCardless', description: 'Banking API pour l\'Europe et le RU.', url: 'https://gocardless.com', logo: '💳' },
  { id: 'plaid', name: 'Plaid', description: 'Connecteur bancaire pour les USA/Canada/Europe.', url: 'https://plaid.com', logo: '🔗' },
];

const TABS: { id: Tab; label: string }[] = [
  { id: 'compte', label: 'Compte' },
  { id: 'espaces', label: 'Espaces' },
  { id: 'sync', label: 'Synchronisation' },
  { id: 'donnees', label: 'Données' },
  { id: 'ia', label: 'IA' },
];

export default function Settings() {
  const { authUser, setPassword, logout, users, loadUsers, spaces, loadSpaces, createSpace, renameSpace } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('compte');

  useEffect(() => { loadUsers(); loadSpaces(); }, [loadUsers, loadSpaces]);

  useEffect(() => {
    if (searchParams.get('setup') === 'enablebanking') {
      setTab('sync');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden">
      <div className="px-6 pt-6 pb-0">
        <h2 className="text-xl font-bold text-white">Paramètres</h2>
      </div>

      {/* ── Onglets ── */}
      <div className="flex gap-0 border-b border-white/[0.08] px-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
        <div className="max-w-2xl space-y-5">
          {tab === 'compte' && <CompteTab authUser={authUser!} setPassword={setPassword} logout={logout} />}
          {tab === 'espaces' && <EspacesTab users={users} spaces={spaces} createSpace={createSpace} renameSpace={renameSpace} />}
          {tab === 'sync' && <SyncTab />}
          {tab === 'donnees' && <DonneesTab />}
          {tab === 'ia' && <IaTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Compte ───────────────────────────────────────────────────────────────

function CompteTab({ authUser, setPassword, logout }: { authUser: any; setPassword: any; logout: any }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [mobileAccess, setMobileAccess] = useState<MobileAccess | null>(null);
  const [savingMobile, setSavingMobile] = useState(false);

  useEffect(() => {
    fetch('/api/mobile-access')
      .then((r) => (r.ok ? r.json() as Promise<MobileAccess> : null))
      .then(setMobileAccess)
      .catch(() => {});
  }, []);

  const handleSavePassword = async (remove: boolean) => {
    setSavingPwd(true);
    try {
      await setPassword(authUser.id, remove ? null : newPwd, currentPwd || undefined);
      setCurrentPwd('');
      setNewPwd('');
      toast.success(remove ? 'Mot de passe retiré' : 'Mot de passe enregistré');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSavingPwd(false);
    }
  };

  const toggleMobile = async (enabled: boolean) => {
    setSavingMobile(true);
    try {
      const res = await fetch('/api/mobile-access', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) });
      if (!res.ok) throw new Error(await res.text());
      setMobileAccess(await res.json());
      toast.success(enabled ? 'Accès mobile activé' : 'Désactivé');
    } catch {
      toast.error('Enregistrement impossible');
    } finally {
      setSavingMobile(false);
    }
  };

  const copyClip = async (v: string) => { try { await navigator.clipboard.writeText(v); toast.success('Copié'); } catch {} };

  return (
    <>
      <Card title="Compte">
        <p className="text-sm text-zinc-400 mb-3">
          Connecté en tant que <span className="text-zinc-200 font-medium">{authUser.name}</span>
        </p>
        <div className="space-y-2">
          {authUser.hasPassword && (
            <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="Mot de passe actuel"
              className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          )}
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
            placeholder={authUser.hasPassword ? 'Nouveau mot de passe' : 'Définir un mot de passe'}
            className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Btn onClick={() => handleSavePassword(false)} disabled={savingPwd || !newPwd}>
              {authUser.hasPassword ? 'Changer' : 'Définir'}
            </Btn>
            {authUser.hasPassword && (
              <Btn variant="ghost" onClick={() => handleSavePassword(true)} disabled={savingPwd || !currentPwd}>
                Retirer
              </Btn>
            )}
            <Btn variant="ghost" onClick={logout} className="ml-auto">Déconnexion</Btn>
          </div>
        </div>
      </Card>

      {mobileAccess && (
        <Card title="Accès mobile">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Autoriser mes appareils</p>
              <p className="text-xs text-zinc-500">{mobileAccess.locked ? 'Imposé par FINDY_LAN_ACCESS' : 'Le serveur écoute le réseau local'}</p>
            </div>
            <button role="switch" aria-checked={mobileAccess.preference} disabled={mobileAccess.locked || savingMobile}
              onClick={() => toggleMobile(!mobileAccess.preference)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${mobileAccess.preference ? 'bg-violet-600' : 'bg-white/15'}`}>
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${mobileAccess.preference ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {mobileAccess.restartRequired && (
            <p className="text-xs text-amber-400/80 mt-2">{mobileAccess.preference ? 'Redémarrez pour ouvrir.' : 'Redémarrez pour refermer.'}</p>
          )}
          {mobileAccess.enabled && mobileAccess.addresses.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {mobileAccess.addresses.map((a) => (
                <button key={a} onClick={() => copyClip(a)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.05] transition-colors">
                  <code className="font-mono text-xs text-zinc-200 truncate">{a}</code>
                  <span className="text-[11px] font-medium text-violet-300 shrink-0">Copier</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

// ─── Espaces ──────────────────────────────────────────────────────────────

function EspacesTab({ users, spaces, createSpace, renameSpace }: any) {
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || newMembers.length < 2) return;
    setCreating(true);
    try {
      await createSpace(newName.trim(), newMembers);
      setNewName(''); setNewMembers([]);
      toast.success('Groupe créé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!renameVal.trim()) return setRenamingId(null);
    try { await renameSpace(id, renameVal.trim()); toast.success('Renommé'); } catch { toast.error('Erreur'); }
    setRenamingId(null);
  };

  return (
    <>
      <Card title="Espaces">
        <div className="space-y-1.5">
          {spaces.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                {renamingId === s.id ? (
                  <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={() => handleRename(s.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s.id); if (e.key === 'Escape') setRenamingId(null); }}
                    className="w-full rounded-lg border border-violet-500/50 bg-zinc-900 px-2 py-1 text-sm text-zinc-50 focus:outline-none" />
                ) : (
                  <p className="text-sm font-medium text-zinc-100 truncate">{s.name}</p>
                )}
                <p className="text-xs text-zinc-500 truncate">{s.kind === 'SHARED' ? (s.members ?? []).map((m: any) => m.name).join(', ') : 'Personnel'}</p>
              </div>
              {s.kind === 'SHARED' && renamingId !== s.id && (
                <button onClick={() => { setRenamingId(s.id); setRenameVal(s.name); }} className="text-[11px] text-zinc-500 hover:text-violet-300 transition-colors">Renommer</button>
              )}
              <span className="text-[10px] uppercase tracking-wide text-zinc-600">{s.kind === 'SHARED' ? 'Groupe' : 'Perso'}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg bg-white/[0.04] p-3 space-y-2.5">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nouveau groupe"
            className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          <div className="flex flex-wrap gap-1.5">
            {users.map((u: any) => (
              <button key={u.id} type="button"
                onClick={() => setNewMembers((p) => p.includes(u.id) ? p.filter((id) => id !== u.id) : [...p, u.id])}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  newMembers.includes(u.id) ? 'border-violet-500/50 bg-violet-600/20 text-violet-200' : 'border-white/10 text-zinc-400 hover:border-white/20'
                }`}>
                {u.name}
              </button>
            ))}
          </div>
          <Btn onClick={handleCreate} disabled={creating || !newName.trim() || newMembers.length < 2}>
            {creating ? '…' : 'Créer'}
          </Btn>
          {newMembers.length === 1 && <p className="text-[10px] text-zinc-600">Au moins deux personnes.</p>}
        </div>
      </Card>
    </>
  );
}

// ─── Synchronisation ──────────────────────────────────────────────────────

function SyncTab() {
  const [syncStatus, setSyncStatus] = useState<Record<string, any>>({});
  const [setupModal, setSetupModal] = useState<SyncProvider | null>(null);
  const [removeModal, setRemoveModal] = useState<SyncProvider | null>(null);
  const [ebAppId, setEbAppId] = useState('');
  const [ebKey, setEbKey] = useState('');
  const [ebPemName, setEbPemName] = useState<string | null>(null);
  const [ebKeyRevealed, setEbKeyRevealed] = useState(false);
  const [ebFingerprint, setEbFingerprint] = useState('');
  const [ebNgrok, setEbNgrok] = useState('');
  const [ebNgrokDomain, setEbNgrokDomain] = useState('');
  const [genericKey, setGenericKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [tunnelStatus, setTunnelStatus] = useState<{ status?: string; error?: string | null; onDemand?: boolean }>({});

  useEffect(() => { loadSync(); loadTunnel(); }, []);

  const loadSync = async () => { try { const r = await fetch('/api/settings/sync'); if (r.ok) setSyncStatus(await r.json()); } catch {} };
  const loadTunnel = async () => {
    try {
      const r = await fetch('/api/tunnel');
      if (!r.ok) return;
      const d = await r.json();
      setTunnelUrl(d.status === 'ready' ? d.publicUrl : '');
      setTunnelStatus({ status: d.status, error: d.error ?? null, onDemand: d.onDemand });
    } catch {}
  };

  const fingerprint = async (key: string) => {
    if (!key.trim() || !globalThis.crypto?.subtle) return '';
    try {
      const dig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.trim()));
      return Array.from(new Uint8Array(dig)).slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('').replace(/(.{4})/g, '$1 ').trim();
    } catch { return ''; }
  };

  const handlePem = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 64 * 1024) return toast.error('Fichier trop volumineux');
    try {
      const c = (await f.text()).trim();
      if (/-----BEGIN [^-]*PUBLIC KEY-----/.test(c)) return toast.error('Clé publique — clé privée requise');
      if (/-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(c)) return toast.error('Clé chiffrée — fournissez une clé non chiffrée');
      if (!/-----BEGIN [^-]*PRIVATE KEY-----/.test(c)) return toast.error('Aucune clé privée PEM détectée');
      setEbKey(c); setEbPemName(f.name); setEbKeyRevealed(false); setEbFingerprint(await fingerprint(c));
      toast.success(`Clé importée depuis ${f.name}`);
    } catch { toast.error('Lecture impossible'); }
  };

  const saveProvider = async () => {
    if (!setupModal) return;
    setSaving(true);
    try {
      const body = setupModal.id === 'enablebanking'
        ? { appId: ebAppId.trim(), privateKey: ebKey.trim(), ngrokAuthToken: ebNgrok.trim(), ngrokDomain: ebNgrokDomain.trim(), enabled: true }
        : { apiKey: genericKey.trim(), enabled: true };
      if (setupModal.id === 'enablebanking' && (!body.appId || !body.privateKey)) { toast.error('Remplissez les champs requis'); setSaving(false); return; }
      if (setupModal.id !== 'enablebanking' && !body.apiKey) { toast.error('Clé API requise'); setSaving(false); return; }
      const r = await fetch(`/api/settings/sync/${setupModal.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Erreur'); }
      setSyncStatus((p) => ({ ...p, [setupModal.id]: { configured: true } }));
      if (setupModal.id === 'enablebanking') {
        const tr = await fetch('/api/tunnel/restart', { method: 'POST' });
        const td = await tr.json().catch(() => null);
        if (tr.ok) setTunnelUrl(td?.publicUrl || '');
      }
      toast.success(`${setupModal.name} configuré`);
      setSetupModal(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Erreur'); }
    finally { setSaving(false); }
  };

  const removeProvider = async () => {
    if (!removeModal) return;
    try { await fetch(`/api/settings/sync/${removeModal.id}`, { method: 'DELETE' }); setSyncStatus((p) => ({ ...p, [removeModal.id]: { configured: false } })); toast.success('Supprimé'); } catch { toast.error('Erreur'); }
    setRemoveModal(null);
  };

  const resetModal = (p: SyncProvider) => {
    setSetupModal(p); setEbAppId(''); setEbKey(''); setEbPemName(null); setEbKeyRevealed(false); setEbFingerprint(''); setEbNgrok(''); setEbNgrokDomain(''); setGenericKey('');
  };

  return (
    <>
      <Card title="Synchronisation bancaire">
        <div className="space-y-2">
          {SYNC_PROVIDERS.map((p) => {
            const cfg = syncStatus[p.id]?.configured;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl">{p.logo}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-white">{p.name}</span>
                      {cfg && <span className="text-[10px] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">✓</span>}
                    </div>
                    {cfg && p.id === 'enablebanking' && syncStatus[p.id] && (
                      <div className="mt-1 space-y-0.5">
                        {syncStatus[p.id].appId && <p className="text-[10px] text-zinc-500">App: <span className="font-mono text-zinc-400">{syncStatus[p.id].appId}</span></p>}
                        {syncStatus[p.id].hasPrivateKey && <p className="text-[10px] text-zinc-500">Clé RSA: <span className="text-green-400/80">✓</span></p>}
                        {tunnelUrl && (
                          <div className="flex items-center gap-1">
                            <code className="text-[9px] text-zinc-500 bg-black/20 rounded px-1 py-0.5 truncate max-w-[200px] select-all">{tunnelUrl}/api/enablebanking/callback</code>
                            <button onClick={() => { navigator.clipboard.writeText(`${tunnelUrl}/api/enablebanking/callback`); toast.success('Copié'); }}
                              className="text-zinc-500 hover:text-white p-0.5">📋</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {cfg ? (
                    <>
                      <button onClick={() => resetModal(p)} className="px-2.5 py-1 text-[11px] font-medium text-zinc-300 rounded-lg hover:bg-white/5 transition-colors">Reconfigurer</button>
                      <button onClick={() => setRemoveModal(p)} className="p-1 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"><TrashIcon className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <button onClick={() => resetModal(p)} className="px-2.5 py-1 text-[11px] font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors">Setup</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Tunnel ── */}
      {tunnelUrl && (
        <Card title="Tunnel HTTPS">
          <div className="flex items-center justify-between">
            <code className="text-xs text-zinc-300 bg-black/20 rounded px-2 py-1 select-all">{tunnelUrl}</code>
            <Btn variant="ghost" onClick={() => { navigator.clipboard.writeText(tunnelUrl); toast.success('Copié'); }}>Copier</Btn>
          </div>
          {tunnelStatus.onDemand && <p className="text-[10px] text-zinc-500 mt-2">Domaine réservé — le tunnel ne s'ouvre que pendant la liaison bancaire.</p>}
        </Card>
      )}

      {/* ── Setup modal ── */}
      {setupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{setupModal.logo}</span>
                <h3 className="text-base font-semibold text-white">{setupModal.name}</h3>
              </div>
              <button onClick={() => setSetupModal(null)} className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-white/5">✕</button>
            </div>

            {setupModal.id === 'enablebanking' ? (
              <div className="space-y-2.5">
                <input type="text" value={ebAppId} onChange={(e) => setEbAppId(e.target.value)} placeholder="App ID" autoFocus
                  className="w-full rounded-lg bg-white/[0.06] text-sm text-white py-2 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono" />
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-zinc-400">Clé privée RSA</label>
                    <label className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] hover:bg-white/[0.1] text-[10px] font-medium text-zinc-300 px-1.5 py-0.5 cursor-pointer">
                      <ArrowUpTrayIcon className="h-2.5 w-2.5" /> .pem
                      <input type="file" accept=".pem,.key" onChange={handlePem} className="hidden" />
                    </label>
                  </div>
                  {ebKey && !ebKeyRevealed ? (
                    <div className="rounded-lg bg-white/[0.06] px-2.5 py-2">
                      <div className="flex items-center gap-1 text-[10px] text-green-400">
                        <CheckCircleIcon className="h-3 w-3" />
                        <span className="truncate">{ebPemName ? ebPemName : 'Clé chargée'}</span>
                      </div>
                      {ebFingerprint && <p className="text-[9px] text-zinc-600 mt-0.5 font-mono">empreinte {ebFingerprint}</p>}
                      <div className="flex gap-2 mt-1">
                        <button type="button" onClick={() => setEbKeyRevealed(true)} className="text-[10px] text-zinc-400 hover:text-zinc-200">Afficher</button>
                        <button type="button" onClick={() => { setEbKey(''); setEbPemName(null); setEbFingerprint(''); }} className="text-[10px] text-zinc-500 hover:text-zinc-300">Effacer</button>
                      </div>
                    </div>
                  ) : (
                    <textarea value={ebKey} onChange={(e) => { setEbKey(e.target.value); setEbPemName(null); setEbFingerprint(''); }}
                      placeholder="-----BEGIN PRIVATE KEY-----" rows={3}
                      className="w-full rounded-lg bg-white/[0.06] text-[11px] text-white py-2 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono resize-none" />
                  )}
                </div>
                <input type="password" value={ebNgrok} onChange={(e) => setEbNgrok(e.target.value)} placeholder="Token Ngrok (requis)"
                  className="w-full rounded-lg bg-white/[0.06] text-sm text-white py-2 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono" />
                <input type="text" value={ebNgrokDomain} onChange={(e) => setEbNgrokDomain(e.target.value)} placeholder="Domaine Ngrok (optionnel)"
                  className="w-full rounded-lg bg-white/[0.06] text-sm text-white py-2 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono" />
              </div>
            ) : (
              <input type="password" value={genericKey} onChange={(e) => setGenericKey(e.target.value)} placeholder="Clé API" autoFocus
                className="w-full rounded-lg bg-white/[0.06] text-sm text-white py-2 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600" />
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setSetupModal(null)} className="px-3 py-1.5 text-sm text-zinc-400 rounded-lg hover:bg-white/5 transition-colors">Annuler</button>
              <button onClick={saveProvider} disabled={saving} className="px-3 py-1.5 text-sm font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 transition-colors">
                {saving ? '…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove modal ── */}
      {removeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRemoveModal(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900/95 border border-white/10 shadow-2xl p-5">
            <h3 className="text-sm font-semibold text-white mb-2">Supprimer {removeModal.name} ?</h3>
            <p className="text-xs text-red-400 mb-4">Les identifiants et la clé RSA seront supprimés.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRemoveModal(null)} className="rounded-lg px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5">Annuler</button>
              <button onClick={removeProvider} className="rounded-lg bg-red-600 hover:bg-red-500 px-3 py-1.5 text-xs font-medium text-white">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Données ──────────────────────────────────────────────────────────────

function DonneesTab() {
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(getAutoUpdateEnabled());
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    fetch('/api/settings/media').then((r) => r.ok ? r.json() : null).then((d) => setImageCount(d?.imageCount ?? 0)).catch(() => {});
    checkForUpdates().then(setVersionInfo).catch(() => {});
  }, []);

  const handleExport = async () => {
    try {
      const r = await fetch('/api/settings/export');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `findy-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { toast.error('Export impossible'); }
  };

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setImporting(true); setMsg(null);
    try {
      const payload = JSON.parse(await f.text());
      const r = await fetch('/api/settings/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Import échoué');
      setMsg({ type: 'success', text: d.message + ' Rechargement…' });
      setTimeout(() => window.location.reload(), 1800);
    } catch (err) { setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Import impossible' }); }
    finally { setImporting(false); }
  };

  const handleRestore = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []); e.target.value = '';
    if (!files.length) return;
    const fd = new FormData();
    for (const f of files) { fd.append('images', f, f.name); fd.append('legacyPath', f.webkitRelativePath || f.name); }
    setRestoring(true);
    try {
      const r = await fetch('/api/settings/media/import', { method: 'POST', body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || 'Erreur');
      setImageCount(d.imageCount ?? imageCount);
      toast.success(d.imported ? `${d.imported} image(s) restaurée(s)` : 'Déjà présent');
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Erreur'); }
    finally { setRestoring(false); }
  };

  const handleToggleUpdate = (v: boolean) => { setAutoUpdate(v); setAutoUpdateEnabled(v); };
  const runCheck = async () => { setChecking(true); try { setVersionInfo(await checkForUpdates()); } finally { setChecking(false); } };
  const handleDownload = async () => {
    setDownloading(true); setProgress({ event: 'started', total: 0 });
    await downloadAndInstallUpdate((p) => { setProgress(p); if (p.event === 'error') { setDownloading(false); toast.error(p.error ?? 'Erreur'); } });
  };

  return (
    <>
      <Card title="Mises à jour">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Mises à jour automatiques</p>
            <p className="text-xs text-zinc-500">
              {versionInfo?.current ? `v${versionInfo.current}` : '…'}
              {versionInfo?.updateAvailable && <span className="ml-1 text-violet-400">→ v{versionInfo.latest}</span>}
            </p>
          </div>
          <button role="switch" aria-checked={autoUpdate} onClick={() => handleToggleUpdate(!autoUpdate)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${autoUpdate ? 'bg-violet-600' : 'bg-white/15'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${autoUpdate ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3">
          {versionInfo?.updateAvailable && !downloading ? (
            <Btn onClick={handleDownload}><ArrowUpIcon className="h-3.5 w-3.5 mr-1" />Mettre à jour</Btn>
          ) : (
            <Btn variant="ghost" onClick={runCheck} disabled={checking || downloading}>
              <ArrowPathIcon className={`h-3.5 w-3.5 mr-1 ${checking ? 'animate-spin' : ''}`} />Vérifier
            </Btn>
          )}
        </div>
        {downloading && progress && (
          <div className="mt-2 rounded-lg bg-white/[0.04] p-2.5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] text-white">
                {progress.event === 'started' && 'Préparation…'}
                {progress.event === 'progress' && 'Téléchargement…'}
                {progress.event === 'finished' && 'Installation…'}
              </p>
              {progress.event === 'progress' && progress.total && (
                <span className="text-[10px] text-zinc-400">{Math.round(((progress.downloaded ?? 0) / progress.total) * 100)}%</span>
              )}
            </div>
            <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: progress.event === 'progress' && progress.total ? `${Math.round(((progress.downloaded ?? 0) / progress.total) * 100)}%` : '25%' }} />
            </div>
          </div>
        )}
      </Card>

      <Card title="Sauvegarde">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-white">Exporter</p>
              <p className="text-[11px] text-zinc-500">Fichier JSON complet</p>
            </div>
            <Btn onClick={handleExport}><ArrowDownTrayIcon className="h-3.5 w-3.5 mr-1" />Exporter</Btn>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-white">Importer</p>
              <p className="text-[11px] text-zinc-500">Remplace toutes les données</p>
            </div>
            <Btn variant="ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
              <ArrowUpTrayIcon className="h-3.5 w-3.5 mr-1" />{importing ? '…' : 'Importer'}
            </Btn>
            <input ref={fileRef} type="file" accept=".json" className="sr-only" onChange={handleImport} />
          </div>
        </div>
        {msg && <p className={`text-xs mt-2 ${msg.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}
      </Card>

      <Card title="Images">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Icônes bancaires</p>
            <p className="text-[11px] text-zinc-500">{imageCount === null ? '…' : `${imageCount} image(s)`}</p>
          </div>
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={() => navigate('/banks')}>Gérer</Btn>
            <Btn onClick={() => mediaRef.current?.click()} disabled={restoring}>
              <PhotoIcon className="h-3.5 w-3.5 mr-1" />{restoring ? '…' : 'Restaurer'}
            </Btn>
            <input ref={mediaRef} type="file" accept="image/*" multiple className="sr-only" onChange={handleRestore} />
          </div>
        </div>
      </Card>
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
  const [lastResult, setLastResult] = useState<{ categorized: number; errors: number } | null>(null);

  useEffect(() => {
    fetch('/api/settings/ai').then((r) => r.json()).then((d) => {
      setEndpoint(d.endpoint || ''); setApiKey(d.apiKey || ''); setModel(d.model || '');
      setEnabled(!!d.enabled);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/settings/ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint, apiKey, model, enabled }) });
      if (!r.ok) throw new Error('Erreur');
      toast.success('Configuration IA enregistrée');
    } catch { toast.error('Enregistrement impossible'); }
    finally { setSaving(false); }
  }, [endpoint, apiKey, model, enabled]);

  const toggle = useCallback(async (next: boolean) => {
    setEnabled(next);
    try {
      await fetch('/api/settings/ai', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) });
    } catch {}
  }, []);

  const runCategorize = useCallback(async () => {
    setCategorizing(true);
    setLastResult(null);
    try {
      const r = await fetch('/api/settings/ai/categorize', { method: 'POST' });
      const d = await r.json();
      setLastResult(d);
      if (d.categorized > 0) toast.success(`${d.categorized} transaction(s) catégorisée(s)`);
      else if (d.errors > 0) toast.error(`${d.errors} erreur(s)`);
      else toast('Aucune transaction à catégoriser');
    } catch { toast.error('Erreur de catégorisation'); }
    finally { setCategorizing(false); }
  }, []);

  if (loading) return <div className="text-xs text-zinc-500">Chargement…</div>;

  return (
    <>
      <Card title="Activation">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Catégorisation automatique</p>
            <p className="text-[11px] text-zinc-500">{enabled ? 'Active — les transactions non catégorisées seront analysées' : 'Désactivée'}</p>
          </div>
          <button role="switch" aria-checked={enabled} onClick={() => toggle(!enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-violet-600' : 'bg-white/15'}`}>
            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </Card>

      <Card title="Configuration IA">
        <div className="space-y-2.5">
          <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Endpoint (ex: http://localhost:11434)" autoComplete="url" inputMode="url"
            className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Clé API (optionnel)" autoComplete="off"
            className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Modèle (ex: llama3, gpt-4o)" autoComplete="off"
            className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-violet-500" />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Btn onClick={save} disabled={saving || !endpoint}>{saving ? '…' : 'Enregistrer'}</Btn>
          <Btn variant="ghost" onClick={runCategorize} disabled={categorizing || !enabled}>
            {categorizing ? '…' : 'Catégoriser maintenant'}
          </Btn>
        </div>
        {lastResult && (
          <p className="text-[11px] text-zinc-500 mt-2">
            {lastResult.categorized} catégorisée(s), {lastResult.errors} erreur(s)
          </p>
        )}
      </Card>

      <div className="rounded-lg bg-white/[0.04] p-3">
        <div className="flex items-start gap-2">
          <CpuChipIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            <span className="font-medium text-zinc-400">Ollama</span> : lancez <code className="font-mono text-zinc-400">ollama serve</code> puis mettez <code className="font-mono text-zinc-400">http://localhost:11434</code>.
            <span className="font-medium text-zinc-400 ml-2">OpenAI</span> : renseignez votre clé API et choisissez un modèle GPT.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 mb-2 px-1">{title}</h3>
      {children}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = 'primary', className = '' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'ghost'; className?: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        variant === 'primary' ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
      } ${className}`}>
      {children}
    </button>
  );
}
