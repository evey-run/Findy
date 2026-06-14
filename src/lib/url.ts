// Base de l'API/assets. Vide en dev (proxy Vite gère /api et /uploads) ;
// surchargeable au build via VITE_API_BASE pour le packaging.
export const API_BASE = import.meta.env.VITE_API_BASE ?? '';

/** Construit l'URL d'un asset servi par le backend (images uploadées). */
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (path.startsWith('http')) return path; // URL déjà absolue (cas externe)
  return `${API_BASE}${path}`;              // '' + '/uploads/x.png' => relatif
}
