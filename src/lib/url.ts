// Base de l'API/assets — résolue à l'exécution, cf. lib/apiBase.ts.
// Vide en dev (le proxy Vite gère /api et /uploads) et sur le web.
export { API_BASE } from './apiBase';
import { API_BASE } from './apiBase';

/** Construit l'URL d'un asset servi par le backend (images uploadées). */
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path; // URL déjà absolue (cas externe)
  return `${API_BASE}${path}`;              // '' + '/uploads/x.png' => relatif
}
