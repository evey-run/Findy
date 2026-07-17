import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import toast from 'react-hot-toast';

const AUTO_UPDATE_KEY = 'findy.autoCheckUpdates';
const NOTIFIED_KEY = 'findy.updateNotified';

export function getAutoUpdateEnabled(): boolean {
  return localStorage.getItem(AUTO_UPDATE_KEY) === 'true';
}

export function setAutoUpdateEnabled(v: boolean): void {
  localStorage.setItem(AUTO_UPDATE_KEY, String(v));
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
}

export async function checkForUpdates(): Promise<VersionInfo | null> {
  try {
    const update: Update | null = await check();
    if (!update) {
      return { current: '', latest: '', updateAvailable: false };
    }

    const current = update.currentVersion ?? '';
    const latest = update.version;
    const updateAvailable = true;

    const alreadyNotified = sessionStorage.getItem(NOTIFIED_KEY) === latest;
    if (!alreadyNotified) {
      sessionStorage.setItem(NOTIFIED_KEY, latest);
      toast(
        `Mise à jour disponible : v${latest}`,
        { id: 'update-available', duration: 8000 }
      );
    }

    return { current, latest, updateAvailable, notes: update.body ?? undefined };
  } catch {
    return null;
  }
}

export async function downloadAndInstallUpdate(
  onProgress?: (progress: UpdateProgress) => void
): Promise<boolean> {
  try {
    const update: Update | null = await check();
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
    const msg = err instanceof Error ? err.message : 'Erreur lors de la mise à jour';
    onProgress?.({ event: 'error', error: msg });
    return false;
  }
}
