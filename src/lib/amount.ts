/**
 * Lecture d'un montant saisi à la main.
 *
 * Le clavier décimal français produit une virgule, que `Number('12,50')` refuse.
 * `<input type="number">` éviterait la question, mais ouvre sur iOS un pavé sans
 * virgule : impossible d'y saisir un centime. On saisit donc du texte, avec
 * `inputMode="decimal"`, et on normalise ici.
 */

/** Convertit une saisie en nombre, ou `null` si elle n'en est pas un. */
export function parseAmount(input: string): number | null {
  // Les espaces incluent l'insécable des séparateurs de milliers collés par
  // un copier-coller depuis un relevé.
  const normalized = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
