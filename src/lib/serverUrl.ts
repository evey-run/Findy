/**
 * Normalisation de l'adresse du serveur saisie sur mobile.
 *
 * Isolée de `apiBase.ts` parce que c'est une fonction pure : `apiBase` lit
 * `import.meta.env`, `localStorage` et `window` dès son évaluation, ce qui la
 * rend intestable hors navigateur. Ce fichier n'a aucune dépendance.
 */

/**
 * Ramène une saisie à une origine utilisable, ou à une chaîne vide.
 *
 * On accepte « 192.168.1.20:36321 » sans schéma — taper « http:// » au clavier
 * virtuel est pénible — et on retire tout chemin ou barre finale, qui
 * produiraient des URLs à double barre à la concaténation.
 */
export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const url = new URL(withScheme);
    // Une URL sans hôte (« http:// ») est syntaxiquement valide pour `URL`
    // mais ne désigne aucun serveur.
    if (!url.hostname) return '';
    // `origin` écarte au passage un chemin collé par erreur (« …/api »).
    return url.origin;
  } catch {
    return '';
  }
}
