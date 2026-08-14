import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, TrashIcon, ArrowPathIcon, ArrowUpIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { getAutoUpdateEnabled, setAutoUpdateEnabled, checkForUpdates, downloadAndInstallUpdate, type VersionInfo, type UpdateProgress } from '../utils/updates';
import { useAppStore } from '../store';

type Msg = { type: 'success' | 'error'; text: string };

interface SyncProvider {
  id: string;
  name: string;
  description: string;
  url: string;
  logo: string;
}

const SYNC_PROVIDERS: SyncProvider[] = [
  {
    id: 'enablebanking',
    name: 'Enable Banking',
    description: 'Open Banking API pour l\'Europe. Supporte +300 portefeuilles dans 20+ pays.',
    url: 'https://enablebanking.com',
    logo: '🏦',
  },
  {
    id: 'gocardless',
    name: 'GoCardless',
    description: 'Banking API pour l\'Europe et le Royaume-Uni. Connexions directes.',
    url: 'https://gocardless.com',
    logo: '💳',
  },
  {
    id: 'plaid',
    name: 'Plaid',
    description: 'Connecteur bancaire pour les USA, Canada et Europe. Données en temps réel.',
    url: 'https://plaid.com',
    logo: '🔗',
  },
];

export default function Settings() {
  // Compte connecté — le mot de passe reste optionnel, on peut l'ajouter ou le retirer ici.
  const { authUser, setPassword, logout, users, loadUsers, spaces, loadSpaces, createSpace, renameSpace } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Espaces : le périmètre de partage (perso vs « Famille ») ──
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceMembers, setNewSpaceMembers] = useState<string[]>([]);
  const [creatingSpace, setCreatingSpace] = useState(false);

  useEffect(() => {
    loadUsers();
    loadSpaces();
  }, [loadUsers, loadSpaces]);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRename = async (spaceId: string) => {
    if (!renameValue.trim()) return setRenamingId(null);
    try {
      await renameSpace(spaceId, renameValue.trim());
      toast.success('Espace renommé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Renommage impossible');
    } finally {
      setRenamingId(null);
    }
  };

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim() || newSpaceMembers.length < 2) return;
    setCreatingSpace(true);
    try {
      await createSpace(newSpaceName.trim(), newSpaceMembers);
      setNewSpaceName('');
      setNewSpaceMembers([]);
      toast.success('Espace créé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setCreatingSpace(false);
    }
  };
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const handleSavePassword = async (remove: boolean) => {
    if (!authUser) return;
    setSavingPwd(true);
    try {
      await setPassword(authUser.id, remove ? null : newPwd, currentPwd || undefined);
      setCurrentPwd('');
      setNewPwd('');
      toast.success(remove ? 'Mot de passe retiré' : 'Mot de passe enregistré');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Modification impossible');
    } finally {
      setSavingPwd(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mises à jour automatiques
  const [autoUpdate, setAutoUpdate] = useState(getAutoUpdateEnabled());
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Sync settings
  const [syncStatus, setSyncStatus] = useState<Record<string, { configured: boolean; appId?: string; hasPrivateKey?: boolean; hasNgrokToken?: boolean; hasNgrokDomain?: boolean }>>({});
  const [setupModal, setSetupModal] = useState<SyncProvider | null>(null);
  const [ebAppIdInput, setEbAppIdInput] = useState('');
  const [ebPrivateKeyInput, setEbPrivateKeyInput] = useState('');
  const [ebNgrokInput, setEbNgrokInput] = useState('');
  const [ebNgrokDomainInput, setEbNgrokDomainInput] = useState('');
  const [genericApiKeyInput, setGenericApiKeyInput] = useState('');
  const [savingSync, setSavingSync] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [removeModal, setRemoveModal] = useState<SyncProvider | null>(null);

  useEffect(() => {
    loadSyncSettings();
    loadTunnelUrl();
    checkForUpdates()
      .then((info) => { if (info) setVersionInfo(info); })
      .catch(() => {});
  }, []);

  // « Lier une banque » redirige ici quand Enable Banking n'est pas configuré —
  // ouvre directement le modal de configuration.
  useEffect(() => {
    if (searchParams.get('setup') !== 'enablebanking') return;
    const provider = SYNC_PROVIDERS.find((p) => p.id === 'enablebanking');
    if (provider) {
      setSetupModal(provider);
      setEbAppIdInput('');
      setEbPrivateKeyInput('');
      setEbNgrokInput('');
      setEbNgrokDomainInput('');
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleToggleAutoUpdate = (next: boolean) => {
    setAutoUpdate(next);
    setAutoUpdateEnabled(next);
    if (next) runUpdateCheck();
  };

  const runUpdateCheck = async () => {
    setCheckingUpdate(true);
    try {
      const info = await checkForUpdates();
      if (info) setVersionInfo(info);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setDownloading(true);
    setUpdateProgress({ event: 'started', total: 0 });
    await downloadAndInstallUpdate((progress) => {
      setUpdateProgress(progress);
      if (progress.event === 'error') {
        setDownloading(false);
        toast.error(progress.error ?? 'Erreur lors de la mise à jour');
      }
    });
  };

  const loadSyncSettings = async () => {
    try {
      const res = await fetch('/api/settings/sync');
      if (res.ok) setSyncStatus(await res.json());
    } catch {}
  };

  const loadTunnelUrl = async () => {
    try {
      const res = await fetch('/api/tunnel');
      if (res.ok) {
        const data = await res.json();
        setTunnelUrl(data.publicUrl);
      }
    } catch {}
  };

  const handleSaveApiKey = async () => {
    if (!setupModal) return;
    setSavingSync(true);
    try {
      let body: any;
      if (setupModal.id === 'enablebanking') {
        if (!ebAppIdInput.trim() || !ebPrivateKeyInput.trim()) {
          toast.error('Remplissez les deux champs');
          setSavingSync(false);
          return;
        }
        body = { appId: ebAppIdInput.trim(), privateKey: ebPrivateKeyInput.trim(), ngrokAuthToken: ebNgrokInput.trim(), ngrokDomain: ebNgrokDomainInput.trim(), enabled: true };
      } else {
        if (!genericApiKeyInput.trim()) {
          toast.error('Entrez une clé API');
          setSavingSync(false);
          return;
        }
        body = { apiKey: genericApiKeyInput.trim(), enabled: true };
      }

      const res = await fetch(`/api/settings/sync/${setupModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      setSyncStatus((prev) => ({ ...prev, [setupModal.id]: { configured: true } }));
      toast.success(`${setupModal.name} configuré avec succès`);
      setSetupModal(null);
      setEbAppIdInput('');
      setEbPrivateKeyInput('');
      setEbNgrokInput('');
      setEbNgrokDomainInput('');
      setGenericApiKeyInput('');
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde de la clé API");
    } finally {
      setSavingSync(false);
    }
  };

  const handleRemoveProvider = async (provider: SyncProvider) => {
    setRemoveModal(provider);
  };

  const confirmRemoveProvider = async () => {
    if (!removeModal) return;
    try {
      await fetch(`/api/settings/sync/${removeModal.id}`, { method: 'DELETE' });
      setSyncStatus((prev) => ({ ...prev, [removeModal.id]: { configured: false } }));
      toast.success(`${removeModal.name} supprimé`);
      setRemoveModal(null);
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleExport = async () => {
    setMsg(null);
    try {
      const res = await fetch('/api/settings/export');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `findy-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setMsg({ type: 'error', text: "Erreur lors de l'export" });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setMsg(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const res = await fetch('/api/settings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import échoué');

      setMsg({ type: 'success', text: json.message + ' Rechargement en cours…' });
      setTimeout(() => window.location.reload(), 1800);
    } catch (err) {
      setMsg({
        type: 'error',
        text: err instanceof Error ? err.message : "Erreur lors de l'import",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-6 overflow-y-auto custom-scrollbar pb-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Paramètres</h2>
        <p className="text-sm text-zinc-400 mt-1">Gérez vos données et préférences</p>
      </div>

      {/* ── Compte ── */}
      {authUser && (
        <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 max-w-2xl">
          <h3 className="text-base font-semibold text-white mb-0.5">Compte</h3>
          <p className="text-sm text-zinc-400 mb-5">
            Connecté en tant que <span className="text-zinc-200 font-medium">{authUser.name}</span>.
            Le mot de passe est optionnel — il sert uniquement à protéger l'accès à ce profil.
          </p>

          <div className="space-y-3">
            {authUser.hasPassword && (
              <input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Mot de passe actuel"
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
              />
            )}
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder={authUser.hasPassword ? 'Nouveau mot de passe' : 'Définir un mot de passe'}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSavePassword(false)}
                disabled={savingPwd || !newPwd}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
              >
                {authUser.hasPassword ? 'Changer le mot de passe' : 'Définir un mot de passe'}
              </button>
              {authUser.hasPassword && (
                <button
                  onClick={() => handleSavePassword(true)}
                  disabled={savingPwd || !currentPwd}
                  className="border border-white/10 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-300 text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
                >
                  Retirer le mot de passe
                </button>
              )}
              <button
                onClick={logout}
                className="ml-auto border border-white/10 hover:bg-white/5 text-zinc-400 text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Espaces ── */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 max-w-2xl">
        <h3 className="text-base font-semibold text-white mb-0.5">Espaces</h3>
        <p className="text-sm text-zinc-400 mb-5">
          Un espace définit qui voit quoi. Votre espace personnel reste privé. Un groupe
          réunit au moins deux personnes et porte le nom que vous lui donnez — comptes,
          objectifs et budgets appartiennent chacun à un espace.
        </p>

        <div className="space-y-2 mb-5">
          {spaces.map((space) => (
            <div
              key={space.id}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                {renamingId === space.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRename(space.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(space.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="w-full bg-zinc-900 border border-violet-500/50 rounded-lg px-2 py-1 text-sm text-zinc-50 focus:outline-none"
                  />
                ) : (
                  <p className="text-sm font-medium text-zinc-100 truncate">{space.name}</p>
                )}
                <p className="text-xs text-zinc-500 truncate">
                  {space.kind === 'SHARED'
                    ? (space.members ?? []).map((m) => m.name).join(', ')
                    : 'Personnel'}
                </p>
              </div>
              {space.kind === 'SHARED' && renamingId !== space.id && (
                <button
                  onClick={() => { setRenamingId(space.id); setRenameValue(space.name); }}
                  className="text-xs text-zinc-500 hover:text-violet-300 transition-colors"
                >
                  Renommer
                </button>
              )}
              <span className="text-[11px] uppercase tracking-wide text-zinc-600">
                {space.kind === 'SHARED' ? 'Groupe' : 'Perso'}
              </span>
            </div>
          ))}
          {spaces.length === 0 && (
            <p className="text-sm text-zinc-500">Aucun espace pour l'instant.</p>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-white/10 p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-400">Nouveau groupe</p>
          <input
            type="text"
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            placeholder="Nom du groupe (ex. Famille, Coloc, Tout…)"
            className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-zinc-50 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50"
          />
          <div className="flex flex-wrap gap-2">
            {users.map((user) => {
              const selected = newSpaceMembers.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() =>
                    setNewSpaceMembers((prev) =>
                      prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-violet-500/50 bg-violet-600/20 text-violet-200'
                      : 'border-white/10 text-zinc-400 hover:border-white/20 hover:text-zinc-200'
                  }`}
                >
                  {user.name}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleCreateSpace}
            disabled={creatingSpace || !newSpaceName.trim() || newSpaceMembers.length < 2}
            className="bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
          >
            {creatingSpace ? 'Création…' : 'Créer le groupe'}
          </button>
          {newSpaceMembers.length === 1 && (
            <p className="text-[11px] text-zinc-600">
              Sélectionnez au moins deux personnes — votre espace personnel existe déjà.
            </p>
          )}
        </div>
      </div>

      {/* ── Synchronisation ── */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 max-w-2xl">
        <h3 className="text-base font-semibold text-white mb-0.5">Synchronisation bancaire</h3>
        <p className="text-sm text-zinc-400 mb-5">
          Connectez vos portefeuilles pour synchroniser automatiquement vos transactions.
        </p>

        <div className="space-y-3">
          {SYNC_PROVIDERS.map((provider) => {
            const isConfigured = syncStatus[provider.id]?.configured;
            return (
              <div
                key={provider.id}
                className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl flex-shrink-0">{provider.logo}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{provider.name}</p>
                      {isConfigured && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                          <CheckCircleIcon className="h-3 w-3" />
                          Configuré
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{provider.description}</p>
                    {isConfigured && provider.id === 'enablebanking' && syncStatus[provider.id] && (
                      <div className="mt-2 space-y-1.5">
                        {syncStatus[provider.id].appId && (
                          <p className="text-[11px] text-zinc-500">
                            App ID : <span className="font-mono text-zinc-400">{syncStatus[provider.id].appId}</span>
                          </p>
                        )}
                        {syncStatus[provider.id].hasPrivateKey && (
                          <p className="text-[11px] text-zinc-500">
                            Clé RSA : <span className="text-green-400/80">sauvegardée</span>
                          </p>
                        )}
                        {syncStatus[provider.id].hasNgrokToken !== undefined && (
                          <p className="text-[11px] text-zinc-500">
                            Token Ngrok : <span className={syncStatus[provider.id].hasNgrokToken ? 'text-green-400/80' : 'text-amber-400/80'}>
                              {syncStatus[provider.id].hasNgrokToken ? 'configuré' : 'non configuré'}
                            </span>
                          </p>
                        )}
                        {syncStatus[provider.id].hasNgrokDomain !== undefined && (
                          <p className="text-[11px] text-zinc-500">
                            Domaine Ngrok : <span className={syncStatus[provider.id].hasNgrokDomain ? 'text-green-400/80' : 'text-zinc-500'}>
                              {syncStatus[provider.id].hasNgrokDomain ? 'réservé (URL fixe)' : 'non configuré (URL random)'}
                            </span>
                          </p>
                        )}
                        {tunnelUrl && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <code className="text-[10px] text-zinc-500 bg-black/20 rounded px-1.5 py-0.5 truncate max-w-[260px] select-all">
                              {tunnelUrl}/api/enablebanking/callback
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${tunnelUrl}/api/enablebanking/callback`);
                                toast.success('URL copiée');
                              }}
                              className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-white transition-colors flex-shrink-0"
                              title="Copier l'URL de callback"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isConfigured ? (
                    <>
                      <button
                        onClick={() => { setSetupModal(provider); setEbAppIdInput(''); setEbPrivateKeyInput(''); setEbNgrokInput(''); setEbNgrokDomainInput(''); setGenericApiKeyInput(''); }}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-300 rounded-lg border border-white/10 bg-white/[0.05] hover:bg-white/10 transition-colors"
                      >
                        Reconfigurer
                      </button>
                      <button
                        onClick={() => handleRemoveProvider(provider)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => { setSetupModal(provider); setEbAppIdInput(''); setEbPrivateKeyInput(''); setEbNgrokInput(''); setEbNgrokDomainInput(''); setGenericApiKeyInput(''); }}
                      className="px-3 py-1.5 text-xs font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors"
                    >
                      Setup
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Mises à jour ── */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 max-w-2xl">
        <h3 className="text-base font-semibold text-white mb-0.5">Mises à jour</h3>
        <p className="text-sm text-zinc-400 mb-5">
          Vérifie automatiquement si une nouvelle version de l'application est disponible.
        </p>

        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Recherches de mises à jour automatiques</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {versionInfo?.current
                ? `Version actuelle : v${versionInfo.current}`
                : 'Chargement de la version…'}
              {versionInfo?.updateAvailable && (
                <span className="ml-2 text-violet-400">
                  Mise à jour disponible : v{versionInfo.latest}
                </span>
              )}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={autoUpdate}
            onClick={() => handleToggleAutoUpdate(!autoUpdate)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              autoUpdate ? 'bg-violet-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                autoUpdate ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Vérifier maintenant</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {versionInfo?.updateAvailable
                ? `Nouvelle version disponible : v${versionInfo.latest}`
                : 'Vous utilisez la dernière version disponible.'}
            </p>
            {versionInfo?.notes && (
              <p className="text-xs text-zinc-500 mt-1 max-w-md">{versionInfo.notes}</p>
            )}
          </div>
          {versionInfo?.updateAvailable && !downloading ? (
            <button
              onClick={handleDownloadUpdate}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors"
            >
              <ArrowUpIcon className="h-4 w-4" />
              Mettre à jour
            </button>
          ) : (
            <button
              onClick={runUpdateCheck}
              disabled={checkingUpdate || downloading}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg border border-white/10 bg-white/[0.05] transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              <ArrowPathIcon className={`h-4 w-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
              {checkingUpdate ? 'Vérification…' : 'Vérifier'}
            </button>
          )}
        </div>

        {downloading && updateProgress && (
          <div className="mt-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-white">
                {updateProgress.event === 'started' && 'Préparation du téléchargement…'}
                {updateProgress.event === 'progress' && 'Téléchargement en cours…'}
                {updateProgress.event === 'finished' && 'Installation en cours… Redémarrage automatique.'}
              </p>
              {updateProgress.event === 'progress' && updateProgress.total ? (
                <span className="text-xs text-zinc-400">
                  {Math.round(((updateProgress.downloaded ?? 0) / updateProgress.total) * 100)}%
                </span>
              ) : null}
            </div>
            {updateProgress.event === 'progress' && updateProgress.total ? (
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${Math.round(((updateProgress.downloaded ?? 0) / updateProgress.total) * 100)}%` }}
                />
              </div>
            ) : updateProgress.event === 'finished' ? (
              <div className="w-full h-1.5 rounded-full bg-violet-500/30 overflow-hidden">
                <div className="h-full rounded-full bg-violet-500 animate-pulse w-full" />
              </div>
            ) : (
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-violet-500/50 animate-pulse w-1/4" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sauvegarde des données ── */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 max-w-2xl">
        <h3 className="text-base font-semibold text-white mb-0.5">Sauvegarde des données</h3>
        <p className="text-sm text-zinc-400 mb-6">
          Exportez ou importez l'intégralité de vos données (transactions, portefeuilles, catégories, budgets…).
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            <div>
              <p className="text-sm font-medium text-white">Exporter la base de données</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Télécharge un fichier JSON contenant toutes vos données.
              </p>
            </div>
            <button
              onClick={handleExport}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg transition-opacity hover:opacity-80 bg-violet-600"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Exporter
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.07]">
            <div>
              <p className="text-sm font-medium text-white">Importer une sauvegarde</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Restaure depuis un fichier JSON.{' '}
                <span className="text-red-400">Remplace toutes les données existantes.</span>
              </p>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg border border-white/10 bg-white/[0.05] transition-opacity hover:opacity-80 disabled:opacity-40"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              {importing ? 'Import…' : 'Importer'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="sr-only"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {msg && (
          <div
            className={`mt-4 px-4 py-3 rounded-xl text-sm border ${
              msg.type === 'success'
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>

      {/* ── Setup modal ── */}
      {setupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{setupModal.logo}</span>
                <h3 className="text-lg font-semibold text-white">{setupModal.name}</h3>
              </div>
              <button
                onClick={() => setSetupModal(null)}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-white/5"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-sm text-zinc-400 mb-4">
              {setupModal.id === 'enablebanking' ? (
                <>
                  Configurez vos identifiants Enable Banking pour activer la synchronisation.
                  Obtenez-les sur{' '}
                  <a href={setupModal.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">
                    {setupModal.url.replace('https://', '')}
                  </a>
                </>
              ) : (
                <>
                  Entrez votre clé API pour activer la synchronisation avec{' '}
                  <span className="text-zinc-200 font-medium">{setupModal.name}</span>.
                </>
              )}
            </p>

            {setupModal.id === 'enablebanking' ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">App ID</label>
                  <input
                    type="text"
                    value={ebAppIdInput}
                    onChange={(e) => setEbAppIdInput(e.target.value)}
                    placeholder="ex: 6e444..."
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white py-2.5 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">Clé privée RSA</label>
                  <textarea
                    value={ebPrivateKeyInput}
                    onChange={(e) => setEbPrivateKeyInput(e.target.value)}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    rows={4}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white py-2.5 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono text-xs resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Token Ngrok <span className="text-zinc-600">(requis pour le lien bancaire)</span>
                  </label>
                  <input
                    type="password"
                    value={ebNgrokInput}
                    onChange={(e) => setEbNgrokInput(e.target.value)}
                    placeholder="2abc... (gratuit sur ngrok.com → Auth Tokens)"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white py-2.5 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Un seul compte gratuit sur <a href="https://dashboard.ngrok.com/signup" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">ngrok.com</a> → copiez votre Authtoken.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Domaine Ngrok <span className="text-zinc-600">(optionnel — pour URL fixe)</span>
                  </label>
                  <input
                    type="text"
                    value={ebNgrokDomainInput}
                    onChange={(e) => setEbNgrokDomainInput(e.target.value)}
                    placeholder="mon-app.ngrok-free.app"
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white py-2.5 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600 font-mono"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">
                    <a href="https://dashboard.ngrok.com/domains" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Réservez un domaine gratuit</a> sur ngrok.com pour une URL qui ne change jamais.
                  </p>
                </div>
                <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-3 space-y-2">
                  <p className="text-xs text-violet-300">
                    Un tunnel HTTPS sera créé au lancement pour le callback OAuth.
                  </p>
                  {tunnelUrl && (
                    <div>
                      <p className="text-[10px] text-zinc-500 mb-1">Ajoutez cette URL dans Enable Banking → Redirect URIs :</p>
                      <div className="flex items-center gap-1.5">
                        <code className="flex-1 text-[10px] text-zinc-300 bg-black/30 rounded px-2 py-1.5 truncate select-all">
                          {tunnelUrl}/api/enablebanking/callback
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${tunnelUrl}/api/enablebanking/callback`);
                            toast.success('URL copiée');
                          }}
                          className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors flex-shrink-0"
                          title="Copier"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {!tunnelUrl && (
                    <p className="text-[10px] text-amber-400/80">
                      ⚠ Aucun tunnel actif — le lien bancaire ne fonctionnera pas. Configurez le token et/ou le domaine ngrok ci-dessus.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Clé API</label>
                <input
                  type="password"
                  value={genericApiKeyInput}
                  onChange={(e) => setGenericApiKeyInput(e.target.value)}
                  placeholder="Entrez votre clé API..."
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white py-2.5 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
                />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setSetupModal(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 rounded-lg hover:bg-white/5 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveApiKey}
                disabled={savingSync}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-40"
              >
                {savingSync ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove provider confirmation modal ── */}
      {removeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRemoveModal(null)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <TrashIcon className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-50">Supprimer la configuration</h3>
                <p className="text-xs text-zinc-500">{removeModal.name}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400 mb-1">
              Voulez-vous vraiment supprimer cette configuration ?
            </p>
            <p className="text-sm text-red-400 font-medium mb-5">
              Les identifiants et la clé RSA seront supprimés.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRemoveModal(null)}
                className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-50 hover:bg-white/5 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmRemoveProvider}
                className="rounded-lg bg-red-600 hover:bg-red-500 px-3.5 py-2 text-sm font-medium text-white transition-colors"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
