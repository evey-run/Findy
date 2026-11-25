/**
 * Bornes de plage de dates pour les filtres de transactions.
 *
 * Une date seule (YYYY-MM-DD, saisie par un champ <input type="date">) vaut
 * minuit UTC : utilisée telle quelle comme borne de fin, elle exclurait les
 * transactions du jour choisi. On la ramène donc à la fin de la journée (UTC).
 * Les ISO complets (liens du Dashboard) restent inchangés.
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseRangeEnd(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const raw = value.trim();
  const date = new Date(DATE_ONLY.test(raw) ? `${raw}T23:59:59.999Z` : raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
