import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import toast from 'react-hot-toast';

const AUTO_UPDATE_KEY = 'findy.autoCheckUpdates';
const NOTIFIED_KEY = 'findy.updateNotified';

export function getAutoUpdateEnabled(): boolean {
  return localStorage.getItem(AUTO_UPDATE_KEY) === 'true';
}

export function setAutoUpdateEnabled(v: boolean): void {
  localStorage.setItem(AUTO_UPDATE_KEY, String(v));
}

/**
 * Décrit une erreur venue du pont Tauri.
 *
 * Le plugin updater rejette avec une **chaîne**, pas un objet `Error` : un test
 * `err instanceof Error` est donc toujours faux, et la vraie cause — signature
 * refusée, 404 sur le manifeste, échec de remplacement du bundle — était
 * remplacée par un message générique. C'est ce qui a rendu la panne
 * 0.5.5 → 0.5.6 impossible à diagnostiquer depuis l'application.
 */
function describeError(err: unknown): string {
  if (typeof err === 'string' && err.trim()) return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
    try {
      return JSON.stringify(err);
    } catch {
      /* objet non sérialisable : on retombe sur String() */
    }
  }
  return String(err);
}

async function currentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return '';
  }
}

export interface UpdateProgress {
  event: 'started' | 'progress' | 'finished' | 'error';
  downloaded?: number;
  total?: number;
  error?: string;
}

export interface VersionInfo {
  current: string;
  latest: string;
  updateAvailable: boolean;
  notes?: string;
  /** Renseigné quand la vérification elle-même a échoué (réseau, manifeste, signature). */
  error?: string;
}

/**
 * L'objet Update détenu entre la vérification et l'installation.
 *
 * Rappeler `check()` au moment d'installer ajoutait un aller-retour réseau qui
 * pouvait échouer seul et afficher « Aucune mise à jour disponible » alors
 * qu'une mise à jour venait d'être proposée.
 */
let pendingUpdate: Update | null = null;

export async function checkForUpdates(): Promise<VersionInfo> {
  const current = await currentVersion();

  try {
    const update: Update | null = await check();

    if (!update) {
      pendingUpdate = null;
      return { current, latest: current, updateAvailable: false };
    }

    pendingUpdate = update;
    const latest = update.version;

    const alreadyNotified = sessionStorage.getItem(NOTIFIED_KEY) === latest;
    if (!alreadyNotified) {
      sessionStorage.setItem(NOTIFIED_KEY, latest);
      toast(`Mise à jour disponible : v${latest}`, { id: 'update-available', duration: 8000 });
    }

    return {
      current: update.currentVersion || current,
      latest,
      updateAvailable: true,
      notes: update.body ?? undefined,
    };
  } catch (err) {
    // Un échec de vérification n'est pas « vous êtes à jour » : le confondre
    // avec ce cas affichait une contre-vérité à l'utilisateur.
    const error = describeError(err);
    console.error('[update] vérification impossible :', error);
    return { current, latest: '', updateAvailable: false, error };
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (progress: UpdateProgress) => void
): Promise<boolean> {
  let update = pendingUpdate;

  try {
    if (!update) {
      update = await check();
      pendingUpdate = update;
    }
    if (!update) {
      onProgress?.({ event: 'error', error: 'Aucune mise à jour disponible' });
      return false;
    }

    let downloaded = 0;
    let contentLength = 0;

    await update.downloadAndInstall((event) => {
      switch (event.event) {
        case 'Started':
          contentLength = event.data.contentLength ?? 0;
          onProgress?.({ event: 'started', total: contentLength });
          break;
        case 'Progress':
          downloaded += event.data.chunkLength;
          onProgress?.({ event: 'progress', downloaded, total: contentLength });
          break;
        case 'Finished':
          onProgress?.({ event: 'finished' });
          break;
      }
    });

    await relaunch();
    return true;
  } catch (err) {
    const error = describeError(err);
    console.error('[update] installation impossible :', error);
    onProgress?.({ event: 'error', error });
    return false;
  }
}
