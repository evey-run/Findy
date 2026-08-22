/**
 * Reste à vivre prévisionnel — « je peux dépenser combien d'ici la fin du mois ? »
 *
 * Tout le calcul est ici, sans Prisma ni Express : c'est un chiffre que
 * l'utilisateur va regarder avant d'acheter, il doit être testable ligne à ligne.
 * La route se contente de rassembler les données et d'appeler `computeForecast`.
 *
 * Trois principes, chacun corrige une erreur qui rendrait le chiffre faux :
 *
 * 1. **Le solde contient déjà le passé.** On ne déduit donc que les échéances
 *    à venir, jamais celles du mois déjà prélevées.
 * 2. **Un budget n'est pas une dette.** Le soustraire du solde donne des
 *    absurdités (un couple avec 105 € en banque et 1 100 € de budgets
 *    obtiendrait −99 €/jour). C'est un plafond : on prend le minimum entre ce
 *    que la trésorerie permet et ce que les budgets autorisent.
 * 3. **Le pire jour commande.** Diviser le solde de fin de mois par le nombre
 *    de jours ignore qu'on peut être à découvert le 25 en attendant le salaire
 *    du 28. On cherche le taux plat maximal qui ne fait passer aucun jour sous
 *    zéro.
 */

export const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export function isKnownFrequency(value: string): value is Frequency {
  return (FREQUENCIES as readonly string[]).includes(value);
}

/** Date civile, telle que l'utilisateur la voit — le fuseau est tranché par le client. */
export interface CivilDate {
  year: number;
  /** 1..12 */
  month: number;
  /** 1..31 */
  day: number;
}

export interface ForecastRecurrence {
  id: string;
  amount: number;
  frequency: string;
  nextDue: Date;
  description: string;
  bankId: string | null;
  categoryId: string;
  /** INCOME | EXPENSE | FIXED */
  categoryType: string;
}

export interface ForecastTransaction {
  id: string;
  bankId: string;
  categoryId: string | null;
  amount: number;
  date: Date;
}

export interface ForecastBudget {
  id: string;
  categoryId: string;
  bankId: string | null;
  amount: number;
}

export interface ForecastInput {
  /** Aujourd'hui, en date civile locale du client. */
  today: CivilDate;
  /** Solde des comptes dépensables à la fin de la journée d'aujourd'hui. */
  availableNow: number;
  /** Récurrences actives rattachées aux comptes dépensables. */
  recurrences: ForecastRecurrence[];
  /** Transactions du mois en cours sur ces comptes, futures comprises. */
  monthTransactions: ForecastTransaction[];
  /** Transactions de la fenêtre d'observation du rythme de dépense. */
  burnTransactions: ForecastTransaction[];
  budgets: ForecastBudget[];
  /** Date de la plus ancienne transaction connue, pour juger de la profondeur d'historique. */
  firstTransactionDate: Date | null;
  /** Récurrences actives sans compte : non rattachables à un espace, donc ignorées. */
  unscopedRecurrenceCount?: number;
  /** Date de la donnée la plus fraîche (transaction ou synchronisation bancaire). */
  lastDataDate?: Date | null;
}

export type ForecastState = 'ok' | 'last-day' | 'projected-overdraft' | 'overdrawn' | 'blocked';

export interface ForecastResult {
  state: ForecastState;
  /** Le chiffre héros, en euros par jour. `null` si un blocage empêche de l'établir. */
  perDay: number | null;
  daysLeft: number;
  availableNow: number;
  projectedEndOfMonth: number;
  /** Ce qui plafonne le chiffre : la trésorerie ou les budgets. */
  limitedBy: 'cash' | 'budget' | null;
  /** Jour du mois où la projection passe sous zéro, le cas échéant. */
  overdraftDay: number | null;
  budgetsLeft: number | null;
  upcoming: Array<{ date: string; amount: number; description: string; recurrenceId: string | null }>;
  runway: {
    state: 'ok' | 'insufficient-data' | 'beyond-horizon';
    /** Date ISO (AAAA-MM-JJ) à laquelle le solde passerait sous zéro. */
    date: string | null;
    days: number | null;
    burnRate: number | null;
  };
  warnings: string[];
  blockers: string[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Au-delà, la donnée est trop vieille pour qu'un chiffre du jour ait un sens. */
const STALE_DAYS = 30;
const STALE_WARN_DAYS = 8;
/** Horizon du runway : au-delà, la question ne se pose plus. */
const RUNWAY_HORIZON_DAYS = 90;
/** Fenêtre maximale d'observation du rythme de dépense. */
const BURN_WINDOW_DAYS = 90;
const MIN_BURN_WINDOW_DAYS = 30;
const MIN_BURN_TRANSACTIONS = 15;
/** En deçà, les budgets ne décrivent plus la réalité des dépenses. */
const MIN_CATEGORIZED_SHARE = 0.5;

function utc(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Jour civil UTC d'une date, sans son heure. */
function dayStart(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Échéance suivante d'une récurrence.
 *
 * `anchorDay` conserve le jour du mois d'origine : sans lui, une échéance au 31
 * janvier avancée de deux mois tomberait le 3 mars, parce que le 31 février
 * n'existe pas et déborde. On ramène donc au dernier jour du mois quand il le
 * faut, puis on repart toujours du jour d'ancrage.
 */
export function advance(date: Date, frequency: Frequency, anchorDay?: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const anchor = anchorDay ?? d;

  switch (frequency) {
    case 'DAILY':
      return new Date(utc(y, m, d + 1));
    case 'WEEKLY':
      return new Date(utc(y, m, d + 7));
    case 'MONTHLY':
      return monthlyStep(y, m, anchor, 1);
    case 'QUARTERLY':
      return monthlyStep(y, m, anchor, 3);
    case 'YEARLY':
      return monthlyStep(y, m, anchor, 12);
  }
}

function monthlyStep(year: number, month: number, anchorDay: number, months: number): Date {
  const absolute = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absolute / 12);
  const targetMonth = (absolute % 12) + 1;
  return new Date(utc(targetYear, targetMonth, Math.min(anchorDay, daysInMonth(targetYear, targetMonth))));
}

export interface Occurrence {
  recurrenceId: string;
  date: Date;
  amount: number;
  bankId: string | null;
  categoryId: string;
  description: string;
}

/**
 * Montant signé d'une récurrence.
 *
 * `Recurrence.amount` est censé être signé — le seed écrit +2800 pour un salaire
 * et −1200 pour un loyer — mais rien ne le valide à l'écriture et l'interface
 * affiche une valeur absolue. Le type de catégorie, lui, est contrôlé côté
 * serveur : c'est donc lui qui tranche.
 */
export function signedRecurrenceAmount(amount: number, categoryType: string): number {
  const magnitude = Math.abs(amount);
  return categoryType === 'INCOME' ? magnitude : -magnitude;
}

/**
 * Occurrences d'une récurrence dans `[from, to)`.
 *
 * `nextDue` n'est pas un état mais un ancrage de phase : la route qui l'avance
 * (`/recurrences/process`) n'est appelée par personne, donc en base cette date
 * est souvent dépassée depuis des mois. On la fait avancer en mémoire jusqu'à
 * la fenêtre, sans jamais rien écrire.
 */
export function occurrencesBetween(
  recurrence: ForecastRecurrence,
  from: Date,
  to: Date,
  guardLimit = 400,
): Occurrence[] {
  if (!isKnownFrequency(recurrence.frequency)) return [];

  const amount = signedRecurrenceAmount(recurrence.amount, recurrence.categoryType);
  const anchorDay = recurrence.nextDue.getUTCDate();
  let cursor = new Date(dayStart(recurrence.nextDue));
  let guard = 0;

  while (cursor.getTime() < from.getTime() && guard++ < guardLimit) {
    cursor = advance(cursor, recurrence.frequency, anchorDay);
  }

  const occurrences: Occurrence[] = [];
  while (cursor.getTime() < to.getTime() && guard++ < guardLimit) {
    occurrences.push({
      recurrenceId: recurrence.id,
      date: new Date(cursor.getTime()),
      amount,
      bankId: recurrence.bankId,
      categoryId: recurrence.categoryId,
      description: recurrence.description,
    });
    cursor = advance(cursor, recurrence.frequency, anchorDay);
  }

  return occurrences;
}

/**
 * Vrai si une transaction correspond visiblement à cette échéance.
 *
 * Sert à ne pas compter deux fois un prélèvement déjà passé en banque : même
 * compte, même catégorie, montant à 1 % près, à trois jours près.
 */
export function matchesOccurrence(occurrence: Occurrence, transaction: ForecastTransaction): boolean {
  if (occurrence.bankId && transaction.bankId !== occurrence.bankId) return false;
  if (transaction.categoryId !== occurrence.categoryId) return false;
  if (Math.abs(transaction.amount - occurrence.amount) > 0.01 * Math.abs(occurrence.amount)) return false;
  return Math.abs(transaction.date.getTime() - occurrence.date.getTime()) <= 3 * MS_PER_DAY;
}

/**
 * Identifiants des transactions qui ne sont que des virements entre deux comptes
 * de l'utilisateur.
 *
 * Sans ce tri, un virement de 3 000 € vers son propre livret compte comme une
 * dépense et écrase le rythme de dépense. On apparie par montant opposé, à trois
 * jours près, entre deux comptes différents — jamais par le nom de la catégorie,
 * qui contient aussi de vrais paiements à des tiers.
 */
export function internalTransferIds(transactions: ForecastTransaction[]): Set<string> {
  const paired = new Set<string>();
  const outgoing = transactions.filter((t) => t.amount < 0).sort((a, b) => a.date.getTime() - b.date.getTime());
  const incoming = transactions.filter((t) => t.amount > 0);

  for (const out of outgoing) {
    if (paired.has(out.id)) continue;
    const match = incoming.find(
      (inc) =>
        !paired.has(inc.id) &&
        inc.bankId !== out.bankId &&
        Math.abs(inc.amount + out.amount) <= 0.005 * Math.abs(out.amount) &&
        Math.abs(inc.date.getTime() - out.date.getTime()) <= 3 * MS_PER_DAY,
    );
    if (match) {
      paired.add(out.id);
      paired.add(match.id);
    }
  }

  return paired;
}

interface DailyPath {
  perDayCash: number;
  overdraftDay: number | null;
  endOfMonth: number;
}

/**
 * Taux plat maximal qui ne fait passer aucun jour sous zéro.
 *
 * Diviser le solde de fin de mois par le nombre de jours restants serait trop
 * généreux : on peut être à sec le 25 alors que le salaire tombe le 28. Prendre
 * le minimum du chemin serait trop prudent. Le taux exact est le minimum, sur
 * chaque jour n, de « ce qui reste au jour n » divisé par n.
 */
export function dailyPath(availableNow: number, flowsByDay: Map<number, number>, firstDay: number, daysLeft: number): DailyPath {
  let running = availableNow;
  let perDayCash = Number.POSITIVE_INFINITY;
  let overdraftDay: number | null = null;

  for (let n = 1; n <= daysLeft; n += 1) {
    const day = firstDay + n - 1;
    running += flowsByDay.get(day) ?? 0;
    if (running < 0 && overdraftDay === null) overdraftDay = day;
    perDayCash = Math.min(perDayCash, running / n);
  }

  return { perDayCash, overdraftDay, endOfMonth: running };
}

function toIsoDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function computeForecast(input: ForecastInput): ForecastResult {
  const { today, availableNow } = input;
  const warnings: string[] = [];
  const blockers: string[] = [];

  const monthLength = daysInMonth(today.year, today.month);
  const currentDay = Math.min(today.day, monthLength);
  const monthStart = new Date(utc(today.year, today.month, 1));
  const monthEnd = new Date(utc(today.year, today.month + 1, 1));
  // Aujourd'hui appartient au passé : le solde inclut déjà les dépenses du jour.
  const cutoff = new Date(utc(today.year, today.month, currentDay + 1));
  const daysLeft = monthLength - currentDay + 1;

  // ── Blocages : mieux vaut expliquer que d'afficher un chiffre inventé ──
  const hasHistory = input.firstTransactionDate !== null;
  if (!hasHistory) blockers.push('NO_TRANSACTIONS');

  const lastData = input.lastDataDate ?? null;
  if (lastData) {
    const ageDays = Math.floor((cutoff.getTime() - dayStart(lastData)) / MS_PER_DAY);
    if (ageDays > STALE_DAYS) blockers.push('STALE_DATA');
    else if (ageDays >= STALE_WARN_DAYS) warnings.push('AGING_DATA');
  }

  if (input.unscopedRecurrenceCount) warnings.push('UNSCOPED_RECURRENCES');
  if (input.recurrences.some((r) => !isKnownFrequency(r.frequency))) warnings.push('UNKNOWN_FREQUENCY');

  // ── Échéances à venir, rattrapées en mémoire ──
  const occurrences = input.recurrences.flatMap((r) => occurrencesBetween(r, cutoff, monthEnd));

  // Déjà prélevé ce mois-ci, ou déjà saisi à l'avance : ne pas compter deux fois.
  const settled = input.monthTransactions;
  const upcomingOccurrences = occurrences.filter(
    (occurrence) => !settled.some((t) => matchesOccurrence(occurrence, t)),
  );

  // Les transactions futures ne sont pas dans `availableNow` (borné à aujourd'hui) :
  // elles s'ajoutent aux flux à venir.
  const futureTransactions = input.monthTransactions.filter((t) => t.date.getTime() >= cutoff.getTime());

  const flows = [
    ...upcomingOccurrences.map((o) => ({ date: o.date, amount: o.amount, description: o.description, recurrenceId: o.recurrenceId })),
    ...futureTransactions.map((t) => ({ date: t.date, amount: t.amount, description: 'Opération planifiée', recurrenceId: null })),
  ];

  const flowsByDay = new Map<number, number>();
  for (const flow of flows) {
    const day = new Date(flow.date).getUTCDate();
    flowsByDay.set(day, (flowsByDay.get(day) ?? 0) + flow.amount);
  }

  const { perDayCash, overdraftDay, endOfMonth } = dailyPath(availableNow, flowsByDay, currentDay, daysLeft);

  // ── Plafond budgétaire ──
  const transfers = internalTransferIds(input.monthTransactions);
  const spentThisMonth = input.monthTransactions.filter(
    (t) => t.amount < 0 && t.date.getTime() < cutoff.getTime() && !transfers.has(t.id),
  );

  const budgetGroups = new Map<string, { cap: number; categoryId: string; bankId: string | null; count: number }>();
  for (const budget of input.budgets) {
    const key = `${budget.categoryId}|${budget.bankId ?? ''}`;
    const group = budgetGroups.get(key);
    if (group) {
      group.cap += budget.amount;
      group.count += 1;
    } else {
      budgetGroups.set(key, { cap: budget.amount, categoryId: budget.categoryId, bankId: budget.bankId, count: 1 });
    }
  }
  if ([...budgetGroups.values()].some((g) => g.count > 1)) warnings.push('DUPLICATE_BUDGETS');

  let budgetsLeft: number | null = null;
  let perDayBudget = Number.POSITIVE_INFINITY;

  if (budgetGroups.size > 0) {
    const categorized = spentThisMonth.filter((t) => t.categoryId !== null).length;
    const categorizedShare = spentThisMonth.length === 0 ? 1 : categorized / spentThisMonth.length;

    if (categorizedShare < MIN_CATEGORIZED_SHARE) {
      // Des budgets sur des dépenses majoritairement non classées ne mesurent rien.
      warnings.push('LOW_CATEGORIZATION');
    } else {
      let total = 0;
      for (const group of budgetGroups.values()) {
        const spent = spentThisMonth
          .filter((t) => t.categoryId === group.categoryId && (!group.bankId || t.bankId === group.bankId))
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        // Les échéances à venir de cette catégorie consomment aussi le budget :
        // les ignorer autoriserait à dépenser une somme déjà engagée.
        const committed = upcomingOccurrences
          .filter((o) => o.amount < 0 && o.categoryId === group.categoryId && (!group.bankId || o.bankId === group.bankId))
          .reduce((sum, o) => sum + Math.abs(o.amount), 0);
        total += Math.max(0, group.cap - spent - committed);
      }
      budgetsLeft = total;
      perDayBudget = total / daysLeft;
    }
  }

  const perDayRaw = Math.min(perDayCash, perDayBudget);
  const limitedBy = budgetGroups.size > 0 && perDayBudget < perDayCash ? 'budget' : 'cash';

  // ── Runway ──
  const runway = computeRunway(input, availableNow, cutoff, transfers);

  const blocked = blockers.length > 0;
  let state: ForecastState = 'ok';
  if (blocked) state = 'blocked';
  else if (availableNow < 0) state = 'overdrawn';
  else if (overdraftDay !== null) state = 'projected-overdraft';
  else if (daysLeft === 1) state = 'last-day';

  return {
    state,
    // Arrondi vers le bas : un reste à vivre annoncé plus grand qu'il n'est
    // ferait dépenser de l'argent qui n'existe pas.
    perDay: blocked ? null : Math.max(0, Math.floor(perDayRaw)),
    daysLeft,
    availableNow: round2(availableNow),
    projectedEndOfMonth: round2(endOfMonth),
    limitedBy: blocked ? null : limitedBy,
    overdraftDay,
    budgetsLeft: budgetsLeft === null ? null : round2(budgetsLeft),
    upcoming: flows
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 10)
      .map((f) => ({
        date: toIsoDay(f.date.getTime()),
        amount: round2(f.amount),
        description: f.description,
        recurrenceId: f.recurrenceId,
      })),
    runway,
    warnings,
    blockers,
  };
}

function computeRunway(
  input: ForecastInput,
  availableNow: number,
  cutoff: Date,
  transfers: Set<string>,
): ForecastResult['runway'] {
  const empty = { state: 'insufficient-data' as const, date: null, days: null, burnRate: null };
  if (!input.firstTransactionDate) return empty;

  const ageDays = Math.floor((cutoff.getTime() - dayStart(input.firstTransactionDate)) / MS_PER_DAY);
  const windowDays = Math.min(BURN_WINDOW_DAYS, ageDays);
  if (windowDays < MIN_BURN_WINDOW_DAYS) return empty;

  const windowStart = cutoff.getTime() - windowDays * MS_PER_DAY;
  const recurrentCategories = new Set(input.recurrences.map((r) => `${r.bankId ?? ''}|${r.categoryId}`));

  const variable = input.burnTransactions.filter(
    (t) =>
      t.amount < 0 &&
      t.date.getTime() >= windowStart &&
      t.date.getTime() < cutoff.getTime() &&
      !transfers.has(t.id) &&
      // Les charges récurrentes sont déjà projetées à leur date : les compter
      // aussi dans le rythme quotidien reviendrait à payer le loyer chaque jour.
      !recurrentCategories.has(`${t.bankId}|${t.categoryId ?? ''}`),
  );

  if (variable.length < MIN_BURN_TRANSACTIONS) return empty;

  const burnRate = variable.reduce((sum, t) => sum + Math.abs(t.amount), 0) / windowDays;
  if (burnRate <= 0) return { state: 'beyond-horizon', date: null, days: null, burnRate: 0 };

  // Projection jour par jour : les revenus à venir repoussent la date d'assèchement.
  const horizonEnd = new Date(cutoff.getTime() + RUNWAY_HORIZON_DAYS * MS_PER_DAY);
  const flows = input.recurrences.flatMap((r) => occurrencesBetween(r, cutoff, horizonEnd, 800));
  const byDay = new Map<number, number>();
  for (const flow of flows) byDay.set(dayStart(flow.date), (byDay.get(dayStart(flow.date)) ?? 0) + flow.amount);

  let balance = availableNow;
  for (let n = 0; n < RUNWAY_HORIZON_DAYS; n += 1) {
    const day = cutoff.getTime() + n * MS_PER_DAY;
    balance += byDay.get(day) ?? 0;
    balance -= burnRate;
    if (balance < 0) {
      return { state: 'ok', date: toIsoDay(day), days: n + 1, burnRate: round2(burnRate) };
    }
  }

  return { state: 'beyond-horizon', date: null, days: null, burnRate: round2(burnRate) };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
