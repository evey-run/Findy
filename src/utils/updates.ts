import toast from 'react-hot-toast';

const AUTO_UPDATE_KEY = 'findy.autoCheckUpdates';
const NOTIFIED_KEY = 'findy.updateNotified';

export function getAutoUpdateEnabled(): boolean {
  return localStorage.getItem(AUTO_UPDATE_KEY) === 'true';
}

export function setAutoUpdateEnabled(v: boolean): void {
  localStorage.setItem(AUTO_UPDATE_KEY, String(v));
}

export interface VersionInfo {
  current: string;
  latest: string;
}

// Compare deux numéros de version semver simples (x.y.z). >0 si a plus récent que b.
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export async function fetchVersionInfo(): Promise<VersionInfo> {
  const res = await fetch('/api/settings/version');
  if (!res.ok) throw new Error('Version check failed');
  return res.json();
}

// Vérifie les mises à jour. Notifie une seule fois par session si une MAJ est dispo.
// Retourne les infos de version (avec updateAvailable) ou null en cas d'erreur.
export async function checkForUpdates(): Promise<(VersionInfo & { updateAvailable: boolean }) | null> {
  try {
    const info = await fetchVersionInfo();
    const updateAvailable = compareVersions(info.latest, info.current) > 0;
    if (updateAvailable) {
      const alreadyNotified = sessionStorage.getItem(NOTIFIED_KEY) === info.latest;
      if (!alreadyNotified) {
        sessionStorage.setItem(NOTIFIED_KEY, info.latest);
        toast(
          `Mise à jour disponible : ${info.current} → ${info.latest}`,
          { id: 'update-available', duration: 8000 }
        );
      }
      return { ...info, updateAvailable };
    }
    return { ...info, updateAvailable: false };
  } catch {
    return null;
  }
}
