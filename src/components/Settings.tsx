import { useState, useRef, useEffect } from 'react';
import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { getAutoUpdateEnabled, setAutoUpdateEnabled, checkForUpdates, fetchVersionInfo, type VersionInfo } from '../utils/updates';

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
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Mises à jour automatiques
  const [autoUpdate, setAutoUpdate] = useState(getAutoUpdateEnabled());
  const [versionInfo, setVersionInfo] = useState<(VersionInfo & { updateAvailable: boolean }) | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  // Sync settings
  const [syncStatus, setSyncStatus] = useState<Record<string, { configured: boolean }>>({});
  const [setupModal, setSetupModal] = useState<SyncProvider | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingSync, setSavingSync] = useState(false);

  useEffect(() => {
    loadSyncSettings();
    fetchVersionInfo()
      .then((info) => setVersionInfo({ ...info, updateAvailable: false }))
      .catch(() => {});
  }, []);

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

  const loadSyncSettings = async () => {
    try {
      const res = await fetch('/api/settings/sync');
      if (res.ok) setSyncStatus(await res.json());
    } catch {}
  };

  const handleSaveApiKey = async () => {
    if (!setupModal || !apiKeyInput.trim()) return;
    setSavingSync(true);
    try {
      const res = await fetch(`/api/settings/sync/${setupModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim(), enabled: true }),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      setSyncStatus((prev) => ({ ...prev, [setupModal.id]: { configured: true } }));
      toast.success(`${setupModal.name} configuré avec succès`);
      setSetupModal(null);
      setApiKeyInput('');
    } catch (err) {
      toast.error("Erreur lors de la sauvegarde de la clé API");
    } finally {
      setSavingSync(false);
    }
  };

  const handleRemoveProvider = async (provider: SyncProvider) => {
    if (!confirm(`Supprimer la configuration de ${provider.name} ?`)) return;
    try {
      await fetch(`/api/settings/sync/${provider.id}`, { method: 'DELETE' });
      setSyncStatus((prev) => ({ ...prev, [provider.id]: { configured: false } }));
      toast.success(`${provider.name} supprimé`);
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
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isConfigured ? (
                    <>
                      <button
                        onClick={() => { setSetupModal(provider); setApiKeyInput(''); }}
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
                      onClick={() => { setSetupModal(provider); setApiKeyInput(''); }}
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
              {versionInfo
                ? `Version actuelle : ${versionInfo.current}`
                : 'Chargement de la version…'}
              {versionInfo?.updateAvailable && (
                <span className="ml-2 text-violet-400">
                  Mise à jour disponible : {versionInfo.current} → {versionInfo.latest}
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
                ? `Nouvelle version disponible : ${versionInfo.current} → ${versionInfo.latest}`
                : 'Vous utilisez la dernière version disponible.'}
            </p>
          </div>
          <button
            onClick={runUpdateCheck}
            disabled={checkingUpdate}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-lg border border-white/10 bg-white/[0.05] transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            <ArrowPathIcon className={`h-4 w-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
            {checkingUpdate ? 'Vérification…' : 'Vérifier'}
          </button>
        </div>
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
              Entrez votre clé API pour activer la synchronisation avec{' '}
              <span className="text-zinc-200 font-medium">{setupModal.name}</span>.
              Obtenez votre clé sur{' '}
              <a href={setupModal.url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 underline">
                {setupModal.url.replace('https://', '')}
              </a>
            </p>

            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Clé API</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Entrez votre clé API..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] text-sm text-white py-2.5 px-3 focus:ring-1 focus:ring-violet-500 focus:outline-none placeholder:text-zinc-600"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }}
            />

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setSetupModal(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-400 rounded-lg hover:bg-white/5 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim() || savingSync}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-violet-600 hover:bg-violet-500 transition-colors disabled:opacity-40"
              >
                {savingSync ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
