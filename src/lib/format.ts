/**
 * Formatage des montants et des dates, en français.
 *
 * Ces fonctions existaient en copies locales dans plusieurs écrans desktop.
 * L'interface mobile les partage plutôt que d'en ajouter une troisième
 * variante : « 1 234,56 € » doit s'écrire pareil partout, et les libellés de
 * date (« Aujourd'hui », « Hier ») sont ce qui fait qu'une liste se lit d'un
 * coup d'œil sur un téléphone.
 */

const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

const EUR_ROUND = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const EUR_COMPACT = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** « 1 234,56 € ». */
export function formatMoney(amount: number): string {
  return EUR.format(amount);
}

/** « 1 235 € » — pour les grands nombres où les centimes sont du bruit. */
export function formatMoneyRounded(amount: number): string {
  return EUR_ROUND.format(amount);
}

/** « 12,3 k€ » au-delà de mille, sinon la forme complète. */
export function formatMoneyCompact(amount: number): string {
  return Math.abs(amount) >= 1000 ? EUR_COMPACT.format(amount) : EUR.format(amount);
}

/**
 * Montant signé, avec le vrai signe moins typographique.
 *
 * Le tiret du clavier est plus court que les chiffres et casse l'alignement
 * d'une colonne de montants ; « − » (U+2212) a la même chasse qu'un chiffre.
 */
export function formatSigned(amount: number): string {
  if (amount === 0) return EUR.format(0);
  return `${amount > 0 ? '+' : '−'}${EUR.format(Math.abs(amount))}`;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits).replace('.', ',')} %`;
}

// ─── Dates ──────────────────────────────────────────────────────────────────

const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' });
const MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const MONTH_SHORT = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Nombre de jours pleins entre deux dates, du passé vers aujourd'hui. */
function daysAgo(date: Date, reference: Date): number {
  return Math.round((startOfDay(reference) - startOfDay(date)) / 86_400_000);
}

/**
 * Libellé d'un séparateur de jour dans une liste de transactions.
 *
 * « Aujourd'hui » et « Hier » sont ce que l'œil cherche en haut de liste ; au
 * -delà d'une semaine la date chiffrée redevient plus informative que le nom
 * du jour, et l'année n'apparaît que si elle n'est pas l'année courante.
 */
export function formatDayLabel(input: string | Date, reference: Date = new Date()): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';

  const delta = daysAgo(date, reference);
  if (delta === 0) return "Aujourd'hui";
  if (delta === 1) return 'Hier';
  if (delta > 1 && delta < 7) {
    const weekday = WEEKDAY.format(date);
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return date.getFullYear() === reference.getFullYear()
    ? DAY_MONTH.format(date)
    : DAY_MONTH_YEAR.format(date);
}

/** « 14/08 » — la forme la plus dense, pour une ligne serrée. */
export function formatShortDate(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return Number.isNaN(date.getTime()) ? '' : SHORT_DATE.format(date);
}

/** « août 2026 », capitalisé — titre d'une période. */
export function formatMonthYear(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  const label = MONTH_YEAR.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « août » — étiquette d'axe. */
export function formatMonthShort(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return Number.isNaN(date.getTime()) ? '' : MONTH_SHORT.format(date).replace('.', '');
}

/** `YYYY-MM-DD` en heure locale — le format attendu par l'API et `<input type="date">`. */
export function toISODate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Premier et dernier jour du mois d'une date donnée, en `YYYY-MM-DD`. */
export function monthRange(date: Date): { startDate: string; endDate: string } {
  return {
    startDate: toISODate(new Date(date.getFullYear(), date.getMonth(), 1)),
    endDate: toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  };
}
