// Base de l'API/assets — résolue à l'exécution, cf. lib/apiBase.ts.
// Vide en dev (le proxy Vite gère /api et /uploads) et sur le web.
export { API_BASE } from './apiBase';
import { API_BASE } from './apiBase';

/** Construit l'URL d'un asset servi par le backend (images uploadées). */
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path; // URL déjà absolue (cas externe)
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;    // '' + '/uploads/x.png' => relatif
}
