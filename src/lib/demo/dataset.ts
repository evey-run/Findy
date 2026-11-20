/**
 * Base de démonstration : un couple fictif, Camille et Léo.
 *
 * Tout est généré en code, à l'exécution, relativement à la date du jour : un
 * export JSON figé pèserait plusieurs centaines de kilo-octets dans le bundle
 * et serait périmé au bout d'un mois (« dernière opération il y a 40 jours »
 * suffit à bloquer le reste à vivre).
 *
 * Le hasard est déterministe : chaque jour civil a sa propre graine. Deux
 * lancements le même jour donnent exactement les mêmes chiffres — condition
 * pour refaire une capture d'écran — et les dépenses courantes d'un jour donné
 * ne changent pas quand les jours passent. Seuls quelques événements (un
 * week-end, un remboursement entre Camille et Léo) sont placés à « il y a N
 * jours », pour rester visibles dans le tricount quel que soit le jour.
 *
 * Les lignes reprennent les colonnes du schéma Prisma (`prisma/schema.prisma`) :
 * `server.ts` les sérialise comme le ferait Prisma, et les écrans reçoivent
 * exactement la forme que leur renverrait un vrai serveur.
 *
 * Choix de modélisation, imposés par la façon dont le serveur lit les données :
 *   • chaque personne a son espace personnel, et le couple un espace partagé
 *     qui ne contient que le compte joint. Le tricount détecte les virements
 *     « de mes comptes vers les siens » : un compte présent des deux côtés y
 *     ferait apparaître chaque virement interne comme un virement entre eux ;
 *   • pour la même raison, le compte joint n'est alimenté que par des
 *     « participations », dont le libellé n'évoque pas un virement ;
 *   • les achats d'actifs ne sont saisis que sur les comptes d'investissement
 *     (montant négatif + quantité), comme le prévoit `server/src/lib/balance.ts`.
 */

import { DEMO_ASSETS, demoPriceAt } from './market';

// ─── Lignes, calquées sur le schéma Prisma ──────────────────────────────────

export type AccountType = 'CURRENT' | 'SAVINGS' | 'INVESTMENT';
export type CategoryType = 'INCOME' | 'EXPENSE' | 'FIXED';

export interface UserRow {
  id: string;
  name: string;
  avatar: string | null;
  isMe: boolean;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpaceRow {
  id: string;
  name: string;
  kind: 'PERSONAL' | 'SHARED';
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberRow {
  id: string;
  spaceId: string;
  userId: string;
  createdAt: Date;
}

export interface BankRow {
  id: string;
  name: string;
  shortName: string | null;
  color: string;
  image: string | null;
  iban: string | null;
  /** Solde initial stocké — le solde affiché y ajoute les mouvements. */
  balance: number;
  accountType: AccountType;
  archived: boolean;
  spendable: boolean | null;
  cardLast4: string | null;
  brandLogo: string | null;
  brandColors: string | null;
  brandLogoLight: boolean | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  ebAspspName: string | null;
  ebAspspCountry: string | null;
  ebState: string | null;
  ebSessionId: string | null;
  ebAccountUid: string | null;
  ebStatus: string | null;
  ebLinkedAt: Date | null;
  ebExpiresAt: Date | null;
  ebLastSyncAt: Date | null;
  spaceId: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string | null;
  spaceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionRow {
  id: string;
  amount: number;
  description: string;
  date: Date;
  checked: boolean;
  unitPrice: number | null;
  quantity: number | null;
  ticker: string | null;
  assetType: string | null;
  externalId: string | null;
  currency: string | null;
  balanceAfterTransaction: number | null;
  status: string;
  aiCategorized: boolean;
  createdAt: Date;
  updatedAt: Date;
  bankId: string;
  categoryId: string | null;
}

export interface BudgetRow {
  id: string;
  amount: number;
  period: string;
  startDate: Date;
  createdAt: Date;
  updatedAt: Date;
  bankId: string | null;
  categoryId: string;
  spaceId: string | null;
}

export interface RecurrenceRow {
  id: string;
  amount: number;
  frequency: string;
  nextDue: Date;
  description: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  bankId: string | null;
  categoryId: string;
}

export interface ObjectiveRow {
  id: string;
  title: string;
  description: string | null;
  targetAmount: number;
  deadline: Date | null;
  isCompleted: boolean;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  spaceId: string | null;
  /**
   * Émoji de l'objectif. La table réelle n'a pas cette colonne — l'écran garde
   * le choix sur l'appareil — mais l'écran lit `objective.icon` quand il
   * existe : c'est la seule entorse de la démo à la forme du serveur, pour que
   * les objectifs semés n'arborent pas tous la même cible.
   */
  icon?: string;
}

export interface DebtRow {
  id: string;
  amount: number;
  description: string;
  date: Date;
  settled: boolean;
  createdAt: Date;
  updatedAt: Date;
  fromUserId: string;
  toUserId: string;
}

export interface DemoDatabase {
  /** Instant de référence de la génération — « aujourd'hui » pour toute la démo. */
  now: Date;
  /** Profil connecté ; `null` une fois le profil supprimé. */
  sessionUserId: string | null;
  users: UserRow[];
  spaces: SpaceRow[];
  members: MemberRow[];
  banks: BankRow[];
  categories: CategoryRow[];
  transactions: TransactionRow[];
  budgets: BudgetRow[];
  recurrences: RecurrenceRow[];
  objectives: ObjectiveRow[];
  debts: DebtRow[];
  /** Compteur des identifiants créés pendant la démo. */
  nextId: number;
}

// ─── Identifiants ───────────────────────────────────────────────────────────

export const DEMO_IDS = {
  camille: 'demo-user-camille',
  leo: 'demo-user-leo',
  spaceCamille: 'demo-space-camille',
  spaceLeo: 'demo-space-leo',
  spaceFoyer: 'demo-space-foyer',
  principale: 'demo-bank-principale',
  enLigne: 'demo-bank-en-ligne',
  livretA: 'demo-bank-livret-a',
  pea: 'demo-bank-pea',
  crypto: 'demo-bank-crypto',
  joint: 'demo-bank-joint',
  leoCourant: 'demo-bank-leo',
} as const;

// ─── Hasard déterministe ────────────────────────────────────────────────────

/** FNV-1a 32 bits : une graine stable à partir d'un texte. */
function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32 : court, rapide, et largement assez uniforme pour des dépenses fictives. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface Random {
  next: () => number;
  chance: (probability: number) => boolean;
  /** Montant uniforme entre deux bornes, au centime. */
  between: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
}

export function seededRandom(key: string): Random {
  const next = mulberry32(hashSeed(key));
  return {
    next,
    chance: (probability) => next() < probability,
    between: (min, max) => round2(min + (max - min) * next()),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Calendrier ─────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/**
 * Minuit UTC d'un jour civil.
 *
 * C'est ainsi que le serveur stocke les dates saisies (`new Date('AAAA-MM-JJ')`)
 * et que la plupart des banques datent leurs écritures : la démo s'y conforme
 * pour que les bornes de période se comportent comme avec des données réelles.
 */
function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Premier jour ouvré à partir du 1er : un salaire ne tombe pas un dimanche. */
function firstBusinessDay(year: number, month: number): number {
  const weekday = utcDay(year, month, 1).getUTCDay();
  return weekday === 6 ? 3 : weekday === 0 ? 2 : 1;
}

/** Dernier jour ouvré au plus tard le `day` du mois. */
function businessDayOnOrBefore(year: number, month: number, day: number): number {
  const weekday = utcDay(year, month, day).getUTCDay();
  return weekday === 6 ? day - 1 : weekday === 0 ? day - 2 : day;
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

interface CategorySeed {
  key: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
}

/**
 * Catégories communes (`spaceId = null`), comme le jeu par défaut du serveur
 * (`server/src/lib/defaultCategories.ts`), complété de ce qu'un foyer réel finit
 * par créer. Les teintes des plus grosses enveloppes sont nettement distinctes :
 * elles se côtoient dans l'anneau de l'écran Analyse.
 */
const CATEGORY_SEEDS: readonly CategorySeed[] = [
  { key: 'salaire', name: 'Salaire', type: 'INCOME', color: '#22c55e', icon: '💰' },
  { key: 'freelance', name: 'Freelance', type: 'INCOME', color: '#16a34a', icon: '💻' },
  { key: 'remboursements', name: 'Remboursements', type: 'INCOME', color: '#2dd4bf', icon: '↩️' },
  { key: 'participations', name: 'Participations', type: 'INCOME', color: '#34d399', icon: '🤝' },
  { key: 'loyer', name: 'Loyer', type: 'FIXED', color: '#dc2626', icon: '🏠' },
  { key: 'electricite', name: 'Électricité', type: 'FIXED', color: '#f59e0b', icon: '⚡' },
  { key: 'internet', name: 'Internet & mobile', type: 'FIXED', color: '#14b8a6', icon: '📶' },
  { key: 'assurances', name: 'Assurances', type: 'FIXED', color: '#64748b', icon: '🛡️' },
  { key: 'alimentation', name: 'Alimentation', type: 'EXPENSE', color: '#10b981', icon: '🛒' },
  { key: 'restaurants', name: 'Restaurants', type: 'EXPENSE', color: '#f97316', icon: '🍽️' },
  { key: 'transport', name: 'Transport', type: 'EXPENSE', color: '#0ea5e9', icon: '🚆' },
  { key: 'loisirs', name: 'Loisirs', type: 'EXPENSE', color: '#d946ef', icon: '🎬' },
  { key: 'sport', name: 'Sport', type: 'EXPENSE', color: '#84cc16', icon: '🏋️' },
  { key: 'sante', name: 'Santé', type: 'EXPENSE', color: '#ef4444', icon: '💊' },
  { key: 'vetements', name: 'Vêtements', type: 'EXPENSE', color: '#ec4899', icon: '👕' },
  { key: 'abonnements', name: 'Abonnements', type: 'EXPENSE', color: '#6366f1', icon: '🎧' },
  { key: 'maison', name: 'Maison', type: 'EXPENSE', color: '#b45309', icon: '🛋️' },
  { key: 'voyages', name: 'Voyages', type: 'EXPENSE', color: '#06b6d4', icon: '✈️' },
  { key: 'cadeaux', name: 'Cadeaux', type: 'EXPENSE', color: '#f43f5e', icon: '🎁' },
  { key: 'vie-commune', name: 'Vie commune', type: 'EXPENSE', color: '#8b5cf6', icon: '🏡' },
  { key: 'epargne', name: 'Épargne', type: 'EXPENSE', color: '#eab308', icon: '🐷' },
  { key: 'investissement', name: 'Investissement', type: 'EXPENSE', color: '#3b82f6', icon: '📈' },
  { key: 'virements', name: 'Virements', type: 'EXPENSE', color: '#71717a', icon: '🔁' },
];

export type CategoryKey =
  | 'salaire' | 'freelance' | 'remboursements' | 'participations' | 'loyer' | 'electricite'
  | 'internet' | 'assurances' | 'alimentation' | 'restaurants' | 'transport' | 'loisirs'
  | 'sport' | 'sante' | 'vetements' | 'abonnements' | 'maison' | 'voyages' | 'cadeaux'
  | 'vie-commune' | 'epargne' | 'investissement' | 'virements';

export function categoryId(key: CategoryKey): string {
  return `demo-cat-${key}`;
}

// ─── Comptes ────────────────────────────────────────────────────────────────

interface BankSeed {
  id: string;
  name: string;
  shortName: string;
  color: string;
  accountType: AccountType;
  spaceId: string;
  cardLast4: string | null;
  /** Solde au premier jour de l'historique. */
  opening: number;
  /** Ouverture, en jours avant le début de l'historique — fixe l'ordre d'affichage. */
  openedBefore: number;
}

/**
 * Noms génériques, sans marque : la démo est montrée sur le Play Store, et un
 * logo ou un nom de banque réelle n'y a pas sa place. Les teintes reprennent
 * le nuancier du formulaire de compte, pour qu'une modification retombe sur
 * une pastille connue.
 */
const BANK_SEEDS: readonly BankSeed[] = [
  {
    id: DEMO_IDS.principale,
    name: 'Banque principale',
    shortName: 'Principal',
    color: '#8b5cf6',
    accountType: 'CURRENT',
    spaceId: DEMO_IDS.spaceCamille,
    cardLast4: '4821',
    opening: 1_750,
    openedBefore: 1,
  },
  {
    id: DEMO_IDS.enLigne,
    name: 'Banque en ligne',
    shortName: 'En ligne',
    color: '#14b8a6',
    accountType: 'CURRENT',
    spaceId: DEMO_IDS.spaceCamille,
    cardLast4: '0937',
    opening: 270,
    openedBefore: 20,
  },
  {
    id: DEMO_IDS.livretA,
    name: 'Livret A',
    shortName: 'Livret A',
    color: '#10b981',
    accountType: 'SAVINGS',
    spaceId: DEMO_IDS.spaceCamille,
    cardLast4: null,
    opening: 6_180,
    openedBefore: 40,
  },
  {
    id: DEMO_IDS.pea,
    name: 'PEA',
    shortName: 'PEA',
    color: '#3b82f6',
    accountType: 'INVESTMENT',
    spaceId: DEMO_IDS.spaceCamille,
    cardLast4: null,
    opening: 0,
    openedBefore: 700,
  },
  {
    id: DEMO_IDS.crypto,
    name: 'Portefeuille crypto',
    shortName: 'Crypto',
    color: '#ec4899',
    accountType: 'INVESTMENT',
    spaceId: DEMO_IDS.spaceCamille,
    cardLast4: null,
    opening: 0,
    openedBefore: 760,
  },
  {
    id: DEMO_IDS.joint,
    name: 'Compte joint',
    shortName: 'Joint',
    color: '#f59e0b',
    accountType: 'CURRENT',
    spaceId: DEMO_IDS.spaceFoyer,
    cardLast4: '2264',
    opening: 900,
    openedBefore: 60,
  },
  {
    id: DEMO_IDS.leoCourant,
    name: 'Compte courant',
    shortName: 'Courant',
    color: '#64748b',
    accountType: 'CURRENT',
    spaceId: DEMO_IDS.spaceLeo,
    cardLast4: '7310',
    opening: 2_100,
    openedBefore: 30,
  },
];

// ─── Génération ─────────────────────────────────────────────────────────────

/** Nombre de mois complets d'historique avant le mois en cours. */
export const HISTORY_MONTHS = 11;

/** Facture d'électricité du foyer, mois par mois (janvier = 0) : l'hiver se voit. */
const ELECTRICITY_BY_MONTH = [98.4, 89.1, 74.6, 61.2, 52.8, 47.3, 45.9, 44.2, 51.6, 63.4, 78.2, 92.7];

interface Day {
  date: Date;
  iso: string;
  year: number;
  /** Mois 0..11. */
  month: number;
  day: number;
  weekday: number;
  /** 0 = mois en cours, −11 = premier mois de l'historique. */
  monthOffset: number;
  daysAgo: number;
  isToday: boolean;
}

export function createDemoDatabase(now: Date = new Date()): DemoDatabase {
  // « Aujourd'hui » est la date civile locale : c'est elle que l'écran affiche
  // et que le client envoie au calcul du reste à vivre.
  const todayYear = now.getFullYear();
  const todayMonth = now.getMonth();
  const todayDay = now.getDate();
  const today = utcDay(todayYear, todayMonth, todayDay);

  const historyStart = utcDay(todayYear, todayMonth - HISTORY_MONTHS, 1);
  const monthStart = (offset: number) => utcDay(todayYear, todayMonth + offset, 1);
  const daysBefore = (days: number) => new Date(today.getTime() - days * DAY_MS);

  const db: DemoDatabase = {
    now,
    sessionUserId: DEMO_IDS.camille,
    users: [],
    spaces: [],
    members: [],
    banks: [],
    categories: [],
    transactions: [],
    budgets: [],
    recurrences: [],
    objectives: [],
    debts: [],
    nextId: 1,
  };

  const setupDate = new Date(historyStart.getTime() - 90 * DAY_MS);

  // ── Personnes et espaces ──
  db.users.push(
    { id: DEMO_IDS.camille, name: 'Camille', avatar: null, isMe: true, passwordHash: null, createdAt: setupDate, updatedAt: setupDate },
    { id: DEMO_IDS.leo, name: 'Léo', avatar: null, isMe: false, passwordHash: null, createdAt: new Date(setupDate.getTime() + DAY_MS), updatedAt: new Date(setupDate.getTime() + DAY_MS) },
  );

  db.spaces.push(
    { id: DEMO_IDS.spaceCamille, name: 'Camille', kind: 'PERSONAL', color: null, createdAt: setupDate, updatedAt: setupDate },
    { id: DEMO_IDS.spaceLeo, name: 'Léo', kind: 'PERSONAL', color: null, createdAt: setupDate, updatedAt: setupDate },
    { id: DEMO_IDS.spaceFoyer, name: 'Foyer', kind: 'SHARED', color: null, createdAt: new Date(setupDate.getTime() + 2 * DAY_MS), updatedAt: new Date(setupDate.getTime() + 2 * DAY_MS) },
  );

  const membership = (spaceId: string, userId: string): MemberRow => ({
    id: `demo-member-${spaceId.slice('demo-space-'.length)}-${userId.slice('demo-user-'.length)}`,
    spaceId,
    userId,
    createdAt: setupDate,
  });
  db.members.push(
    membership(DEMO_IDS.spaceCamille, DEMO_IDS.camille),
    membership(DEMO_IDS.spaceLeo, DEMO_IDS.leo),
    membership(DEMO_IDS.spaceFoyer, DEMO_IDS.camille),
    membership(DEMO_IDS.spaceFoyer, DEMO_IDS.leo),
  );

  // ── Catalogue ──
  for (const seed of CATEGORY_SEEDS) {
    db.categories.push({
      id: categoryId(seed.key as CategoryKey),
      name: seed.name,
      type: seed.type,
      color: seed.color,
      icon: seed.icon,
      spaceId: null,
      createdAt: setupDate,
      updatedAt: setupDate,
    });
  }

  // ── Comptes ──
  for (const seed of BANK_SEEDS) {
    const opened = new Date(historyStart.getTime() - seed.openedBefore * DAY_MS);
    db.banks.push({
      id: seed.id,
      name: seed.name,
      shortName: seed.shortName,
      color: seed.color,
      image: null,
      iban: null,
      balance: seed.opening,
      accountType: seed.accountType,
      archived: false,
      spendable: null,
      cardLast4: seed.cardLast4,
      brandLogo: null,
      brandColors: null,
      brandLogoLight: null,
      archivedAt: null,
      createdAt: opened,
      updatedAt: opened,
      ebAspspName: null,
      ebAspspCountry: null,
      ebState: null,
      ebSessionId: null,
      ebAccountUid: null,
      ebStatus: null,
      ebLinkedAt: null,
      ebExpiresAt: null,
      ebLastSyncAt: null,
      spaceId: seed.spaceId,
    });
  }

  // ── Opérations ──
  let sequence = 0;

  // Dépenses du mois en cours, jours à venir compris, par espace et catégorie :
  // c'est sur elles que les budgets sont taillés (cf. plus bas).
  const currentMonthStart = monthStart(0);
  const nextMonthStart = monthStart(1);
  const spaceOfBank = new Map(BANK_SEEDS.map((seed) => [seed.id, seed.spaceId]));
  const monthSpend = new Map<string, number>();

  const add = (
    date: Date,
    bankId: string,
    amount: number,
    description: string,
    category: CategoryKey | null,
    asset?: { ticker: string; assetType: string; quantity: number; unitPrice: number },
  ): void => {
    if (category && amount < 0 && date >= currentMonthStart && date < nextMonthStart) {
      const key = `${spaceOfBank.get(bankId)}|${category}`;
      monthSpend.set(key, (monthSpend.get(key) ?? 0) - amount);
    }
    // Rien dans le futur : l'application n'enregistre que des opérations passées.
    if (date.getTime() > today.getTime()) return;
    sequence += 1;
    const recorded = new Date(date.getTime() + 9 * 3_600_000 + sequence * 1_000);
    db.transactions.push({
      id: `demo-tx-${String(sequence).padStart(5, '0')}`,
      amount: round2(amount),
      description,
      date,
      // Pointées au-delà de quelques jours, comme un relevé qu'on rapproche.
      checked: today.getTime() - date.getTime() > 3 * DAY_MS,
      unitPrice: asset?.unitPrice ?? null,
      quantity: asset?.quantity ?? null,
      ticker: asset?.ticker ?? null,
      assetType: asset?.assetType ?? null,
      externalId: null,
      currency: 'EUR',
      balanceAfterTransaction: null,
      status: 'BOOK',
      aiCategorized: false,
      createdAt: recorded,
      updatedAt: recorded,
      bankId,
      categoryId: category ? categoryId(category) : null,
    });
  };

  /** Virement entre deux comptes : deux écritures opposées, le même jour. */
  const transfer = (
    date: Date,
    from: string,
    to: string,
    amount: number,
    outLabel: string,
    inLabel: string,
    category: CategoryKey,
  ): void => {
    add(date, from, -amount, outLabel, category);
    add(date, to, amount, inLabel, category);
  };

  const buyAsset = (date: Date, bankId: string, ticker: string, quantity: number, noise: number) => {
    const asset = DEMO_ASSETS.find((candidate) => candidate.ticker === ticker);
    if (!asset) return;
    const daysAgo = Math.round((today.getTime() - date.getTime()) / DAY_MS);
    const unitPrice = demoPriceAt(ticker, daysAgo, noise);
    add(date, bankId, -round2(quantity * unitPrice), asset.name, 'investissement', {
      ticker,
      assetType: asset.type,
      quantity,
      unitPrice,
    });
  };

  /** Achat programmé d'une somme fixe : la quantité suit le cours. */
  const buyFor = (date: Date, bankId: string, ticker: string, euros: number, noise: number) => {
    const daysAgo = Math.round((today.getTime() - date.getTime()) / DAY_MS);
    const unitPrice = demoPriceAt(ticker, daysAgo, noise);
    const quantity = Math.round((euros / unitPrice) * 1e6) / 1e6;
    buyAsset(date, bankId, ticker, quantity, noise);
  };

  // Positions constituées avant l'historique : le portefeuille a une vie
  // antérieure, sans que ces gros achats ne faussent les mois affichés.
  const initial = seededRandom('positions-initiales');
  buyAsset(daysBefore(700), DEMO_IDS.pea, 'MNDE.PA', 30, initial.next());
  buyAsset(daysBefore(700), DEMO_IDS.pea, 'EMRG.PA', 40, initial.next());
  buyAsset(daysBefore(612), DEMO_IDS.pea, 'AURE.PA', 25, initial.next());
  buyAsset(daysBefore(540), DEMO_IDS.pea, 'MNDE.PA', 15, initial.next());
  buyAsset(daysBefore(470), DEMO_IDS.pea, 'NRDS.PA', 30, initial.next());
  buyAsset(daysBefore(640), DEMO_IDS.crypto, 'BTC', 0.025, initial.next());
  buyAsset(daysBefore(640), DEMO_IDS.crypto, 'ETH', 0.45, initial.next());

  // Jour par jour, du premier mois de l'historique à la fin du mois en cours.
  // Les jours à venir ne sont pas enregistrés (`add` les écarte) : ils ne
  // servent qu'à connaître la dépense du mois entier, pour tailler les budgets.
  for (let cursor = historyStart; cursor.getTime() < nextMonthStart.getTime(); cursor = new Date(cursor.getTime() + DAY_MS)) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const day: Day = {
      date: cursor,
      iso: isoDay(cursor),
      year,
      month,
      day: cursor.getUTCDate(),
      weekday: cursor.getUTCDay(),
      monthOffset: (year - todayYear) * 12 + (month - todayMonth),
      daysAgo: Math.round((today.getTime() - cursor.getTime()) / DAY_MS),
      isToday: cursor.getTime() === today.getTime(),
    };

    generateCamille(day, add, transfer);
    generateCamilleOnline(day, add);
    generateJoint(day, add);
    generateLeo(day, add);
    generateInvestments(day, buyAsset, buyFor);
  }

  generateStories(today, daysBefore, monthStart, add, transfer);

  // L'ordre de stockage est celui d'une base : par date d'écriture.
  db.transactions.sort((a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime());

  // ── Budgets ──
  const budget = (key: CategoryKey, amount: number, spaceId: string): BudgetRow => ({
    id: `demo-budget-${spaceId.slice('demo-space-'.length)}-${key}`,
    amount,
    period: 'MONTHLY',
    startDate: historyStart,
    createdAt: historyStart,
    updatedAt: historyStart,
    bankId: null,
    categoryId: categoryId(key),
    spaceId,
  });
  /**
   * Un budget taillé comme le ferait quelqu'un qui connaît ses habitudes :
   * 20 % au-dessus de ce que le mois en cours dépensera en entier, arrondi à la
   * dizaine. À mi-mois la barre est donc à moitié pleine, et elle ne déborde
   * jamais, quel que soit le jour où l'on ouvre la démo — sauf « Vêtements »,
   * fixé à 120 € pour un dépassement léger et voulu (cf. `generateCamille`).
   */
  const sized = (spaceId: string, key: CategoryKey, floor: number) =>
    Math.max(floor, Math.ceil(((monthSpend.get(`${spaceId}|${key}`) ?? 0) * 1.2) / 10) * 10);

  // Ordre d'insertion = ordre inverse d'affichage (le serveur trie par date de
  // création décroissante) ; l'écran Catégories retrie de toute façon.
  db.budgets.push(
    budget('transport', sized(DEMO_IDS.spaceCamille, 'transport', 100), DEMO_IDS.spaceCamille),
    budget('loisirs', sized(DEMO_IDS.spaceCamille, 'loisirs', 80), DEMO_IDS.spaceCamille),
    budget('vetements', 120, DEMO_IDS.spaceCamille),
    budget('restaurants', sized(DEMO_IDS.spaceCamille, 'restaurants', 150), DEMO_IDS.spaceCamille),
    budget('alimentation', sized(DEMO_IDS.spaceCamille, 'alimentation', 150), DEMO_IDS.spaceCamille),
    budget('maison', sized(DEMO_IDS.spaceFoyer, 'maison', 100), DEMO_IDS.spaceFoyer),
    budget('restaurants', sized(DEMO_IDS.spaceFoyer, 'restaurants', 100), DEMO_IDS.spaceFoyer),
    budget('alimentation', sized(DEMO_IDS.spaceFoyer, 'alimentation', 400), DEMO_IDS.spaceFoyer),
  );

  // ── Récurrences ──
  db.recurrences.push(...buildRecurrences(today, historyStart));

  // ── Objectifs ──
  const objective = (
    key: string,
    title: string,
    icon: string,
    targetAmount: number,
    deadline: Date | null,
    createdAt: Date,
    spaceId: string,
  ): ObjectiveRow => ({
    id: `demo-objective-${key}`,
    title,
    description: '',
    targetAmount,
    deadline,
    isCompleted: false,
    archived: false,
    createdAt,
    updatedAt: createdAt,
    spaceId,
    icon,
  });
  db.objectives.push(
    objective('matelas', 'Matelas de sécurité', '🛟', 5_000, null, utcDay(todayYear, todayMonth - 11, 4), DEMO_IDS.spaceCamille),
    objective('velo', 'Nouveau vélo', '🚲', 1_200, utcDay(todayYear, todayMonth - 2, 1), utcDay(todayYear, todayMonth - 10, 4), DEMO_IDS.spaceCamille),
    objective('japon', 'Voyage au Japon', '✈️', 4_500, utcDay(todayYear, todayMonth + 6, 15), utcDay(todayYear, todayMonth - 9, 4), DEMO_IDS.spaceCamille),
    objective('mariage', 'Mariage', '💍', 8_000, utcDay(todayYear + 1, todayMonth + 2, 1), utcDay(todayYear, todayMonth - 9, 2), DEMO_IDS.spaceFoyer),
  );

  // ── Tricount ──
  db.debts.push(...buildDebts(daysBefore));

  return db;
}

// ─── Flux, compte par compte ────────────────────────────────────────────────

type AddFn = (
  date: Date,
  bankId: string,
  amount: number,
  description: string,
  category: CategoryKey | null,
) => void;

type TransferFn = (
  date: Date,
  from: string,
  to: string,
  amount: number,
  outLabel: string,
  inLabel: string,
  category: CategoryKey,
) => void;

/**
 * Camille — compte principal.
 *
 * Salaire le premier jour ouvré, participation au compte joint, versements
 * vers le Livret A pour ses objectifs, abonnements étalés sur le mois (l'accueil
 * en montre toujours quelques-uns « à venir »), puis le quotidien.
 *
 * Les montants des virements internes sont tous distincts (300, 175, 200…) :
 * le serveur apparie les virements au montant près, et deux virements de même
 * montant à quelques jours d'écart se croiseraient dans le trajet de l'argent.
 */
function generateCamille(day: Day, add: AddFn, transfer: TransferFn): void {
  const { date, year, month, monthOffset } = day;
  const bank = DEMO_IDS.principale;
  const at = (dayOfMonth: number) => day.day === dayOfMonth;

  if (at(firstBusinessDay(year, month))) add(date, bank, 2_736.4, 'Salaire Studio Lumen', 'salaire');
  if (at(2)) add(date, bank, -74.1, 'Pass transports', 'transport');
  if (at(3)) {
    add(date, bank, -1_000, 'Participation compte joint', 'vie-commune');
    if (monthOffset >= -9) add(date, bank, -150, 'Participation Mariage', 'epargne');
  }
  if (at(5)) {
    transfer(date, bank, DEMO_IDS.livretA, 175, 'Virement Économie Matelas de sécurité', 'Virement Économie Matelas de sécurité', 'epargne');
    if (monthOffset >= -9) {
      transfer(date, bank, DEMO_IDS.livretA, 300, 'Virement Économie Voyage au Japon', 'Virement Économie Voyage au Japon', 'epargne');
    }
  }
  if (at(7) && monthOffset >= -8 && monthOffset <= -3) {
    transfer(date, bank, DEMO_IDS.livretA, 200, 'Virement Économie Nouveau vélo', 'Virement Économie Nouveau vélo', 'epargne');
  }
  if (at(6)) add(date, bank, -34.9, 'Salle de sport', 'sport');
  if (at(9)) add(date, bank, -38.6, 'Mutuelle santé', 'assurances');
  if (at(13)) add(date, bank, -9.99, 'Presse en ligne', 'abonnements');
  if (at(16)) add(date, bank, -15.99, 'Forfait mobile', 'internet');
  if (at(19)) add(date, bank, -13.49, 'Streaming vidéo', 'abonnements');
  if (at(21)) add(date, bank, -11.99, 'Musique en ligne', 'abonnements');
  if (at(25)) add(date, bank, -2.99, 'Stockage photos', 'abonnements');
  if (at(28)) add(date, bank, -45, 'Atelier céramique', 'loisirs');
  if (at(27)) {
    transfer(date, bank, DEMO_IDS.enLigne, 250, 'Virement Banque en ligne', 'Virement Banque principale', 'virements');
  }

  // ── Une virée shopping par mois, en début de mois ──
  //
  // C'est l'enveloppe « Vêtements » qui déborde légèrement de son budget de
  // 120 €. Le mois en cours la place au plus tard aujourd'hui, pour que le
  // dépassement se voie quel que soit le jour où l'on ouvre la démo.
  const shopping = seededRandom(`${year}-${month}|shopping`);
  const plannedDay = shopping.int(3, 6);
  const shoppingDay = monthOffset === 0 ? Math.min(plannedDay, todayOfMonth(day)) : plannedDay;
  if (at(shoppingDay)) {
    const total = monthOffset === 0 ? shopping.between(126, 134) : shopping.between(88, 152);
    const shoes = shopping.chance(0.45) ? round2(total * shopping.between(0.35, 0.55)) : 0;
    add(date, bank, -(total - shoes), 'Boutique Atelier Lin', 'vetements');
    if (shoes > 0) add(date, bank, -shoes, 'Chaussures Pavé', 'vetements');
  }

  // ── Le quotidien ──
  const random = seededRandom(`${day.iso}|camille`);
  const weekend = day.weekday === 0 || day.weekday === 6;
  const evening = day.weekday === 5 || day.weekday === 6;

  if (!weekend && random.chance(0.4)) {
    add(date, bank, -random.between(1.9, 3.4), random.pick(['Kiosque Café', 'Café de la Gare']), 'restaurants');
  }
  if (random.chance(weekend ? 0.55 : 0.42)) {
    add(date, bank, -random.between(1.3, 6.4), "Boulangerie Pain d'Or", 'alimentation');
  }
  if (!weekend && random.chance(0.34)) {
    add(
      date,
      bank,
      -random.between(10.5, 17.9),
      random.pick(['Le Comptoir du Midi', 'Sushi Kyo', 'Pizzeria Bella Vita', 'Café des Arts']),
      'restaurants',
    );
  }
  if (random.chance(evening ? 0.3 : 0.07)) {
    add(
      date,
      bank,
      -random.between(24, 58),
      random.pick(['Bistrot des Amis', 'Brasserie du Port', 'Crêperie Ty Breizh']),
      'restaurants',
    );
  }
  if (random.chance(0.28)) {
    add(
      date,
      bank,
      -random.between(7.5, 31),
      random.pick(['Supérette du Marché', 'Primeur des Halles', 'Fromagerie Lucie']),
      'alimentation',
    );
  }
  if (random.chance(0.035)) add(date, bank, -random.between(5.9, 23.5), 'Pharmacie Centrale', 'sante');
  if (random.chance(weekend ? 0.1 : 0.03)) add(date, bank, -random.pick([11.5, 23]), 'Ciné Lumière', 'loisirs');
  if (random.chance(0.03)) add(date, bank, -random.between(9.9, 34), 'Librairie des Canuts', 'loisirs');
  if (random.chance(0.08)) add(date, bank, -random.pick([1.7, 3.4]), 'Vélo en libre-service', 'transport');
  if (random.chance(0.014)) add(date, bank, -random.between(13.5, 27), 'Taxi Lumière', 'transport');

  // Une consultation, puis ses remboursements quelques jours plus tard : sans
  // eux, le compte ne verrait que des sorties entre deux salaires.
  if (random.chance(0.014)) {
    add(date, bank, -30, 'Cabinet médical', 'sante');
    add(new Date(date.getTime() + 6 * DAY_MS), bank, 21, 'Remboursement Assurance maladie', 'remboursements');
    add(new Date(date.getTime() + 9 * DAY_MS), bank, 9, 'Remboursement mutuelle', 'remboursements');
  }
}

/** Jour du mois d'« aujourd'hui », vu depuis un jour du mois en cours. */
function todayOfMonth(day: Day): number {
  return day.day + day.daysAgo;
}

/**
 * Camille — banque en ligne : la carte des sorties, des trains et des achats
 * en ligne, alimentée chaque mois depuis le compte principal.
 */
function generateCamilleOnline(day: Day, add: AddFn): void {
  const { date } = day;
  const bank = DEMO_IDS.enLigne;
  const random = seededRandom(`${day.iso}|en-ligne`);
  const weekend = day.weekday === 0 || day.weekday === 6;

  if (weekend && random.chance(0.18)) {
    add(date, bank, -random.between(18, 42), random.pick(['Brunch Le Jardin', 'Café des Arts']), 'restaurants');
  }
  if (random.chance(0.03)) add(date, bank, -random.between(12, 38), 'Commande en ligne Librairie', 'loisirs');
  if (random.chance(0.03)) add(date, bank, -random.between(29, 89), 'Billet de train', 'voyages');
  if (random.chance(0.015)) add(date, bank, -random.between(8, 14), 'Musée des Beaux-Arts', 'loisirs');
  if (random.chance(0.012)) add(date, bank, -random.between(9.5, 19.9), 'Fleuriste Pivoine', 'cadeaux');
}

/**
 * Compte joint : les participations du 3, le loyer du 5, les charges, les
 * grosses courses du samedi et le marché du dimanche.
 */
function generateJoint(day: Day, add: AddFn): void {
  const { date, month, monthOffset } = day;
  const bank = DEMO_IDS.joint;
  const at = (dayOfMonth: number) => day.day === dayOfMonth;
  const summer = month === 7 && day.day <= 16;

  if (at(3)) {
    add(date, bank, 1_000, 'Participation Camille', 'participations');
    add(date, bank, 900, 'Participation Léo', 'participations');
    if (monthOffset >= -9) {
      add(date, bank, 150, 'Participation Camille — Mariage', 'participations');
      add(date, bank, 150, 'Participation Léo — Mariage', 'participations');
    }
  }
  if (at(5)) add(date, bank, -1_150, 'Loyer', 'loyer');
  if (at(8)) add(date, bank, -18.4, 'Assurance habitation', 'assurances');
  if (at(15)) add(date, bank, -ELECTRICITY_BY_MONTH[month], 'Facture électricité', 'electricite');
  if (at(20)) add(date, bank, -29.99, 'Box internet', 'internet');

  const random = seededRandom(`${day.iso}|joint`);

  // En vacances, pas de courses à la maison.
  if (!summer) {
    if (day.weekday === 6 && random.chance(0.85)) add(date, bank, -random.between(62, 148), 'Hyper Soleil', 'alimentation');
    if (day.weekday === 0 && random.chance(0.45)) add(date, bank, -random.between(14, 38), 'Marché du quartier', 'alimentation');
    if (day.weekday > 0 && day.weekday < 6 && random.chance(0.08)) {
      add(date, bank, -random.between(6, 24), 'Supérette du Marché', 'alimentation');
    }
  }
  if ((day.weekday === 5 || day.weekday === 6) && random.chance(0.1)) {
    add(date, bank, -random.between(42, 88), random.pick(['Brasserie du Port', 'Sushi Kyo']), 'restaurants');
  }
  if (random.chance(0.025)) add(date, bank, -random.between(19, 160), 'Maison & Bois', 'maison');
  if (random.chance(0.02)) add(date, bank, -random.between(9, 58), 'Bricolage du Centre', 'maison');
}

/**
 * Léo — compte personnel.
 *
 * Il n'est jamais affiché à Camille, mais il existe : c'est de lui que partent
 * sa participation au compte joint et les vrais virements entre eux deux, que
 * le tricount doit savoir reconnaître.
 */
function generateLeo(day: Day, add: AddFn): void {
  const { date, year, month, monthOffset } = day;
  const bank = DEMO_IDS.leoCourant;
  const at = (dayOfMonth: number) => day.day === dayOfMonth;

  if (at(businessDayOnOrBefore(year, month, 28))) add(date, bank, 2_614.35, 'Salaire Vélia Ingénierie', 'salaire');
  if (at(3)) {
    add(date, bank, -900, 'Participation compte joint', 'vie-commune');
    if (monthOffset >= -9) add(date, bank, -150, 'Participation Mariage', 'epargne');
  }
  if (at(7)) add(date, bank, -9.99, 'Forfait mobile', 'internet');
  if (at(10)) add(date, bank, -600, 'Versement assurance vie', 'epargne');
  if (at(14)) add(date, bank, -39, "Salle d'escalade", 'sport');

  const random = seededRandom(`${day.iso}|leo`);
  if (random.chance(0.3)) add(date, bank, -random.between(2.2, 4.8), 'Café de la Gare', 'restaurants');
  if (random.chance(0.3)) add(date, bank, -random.between(11, 19), random.pick(['Le Comptoir du Midi', 'Pizzeria Bella Vita', 'Sushi Kyo']), 'restaurants');
  if (random.chance(0.07)) add(date, bank, -random.between(45, 72), 'Station-service', 'transport');
  if (random.chance(0.12)) add(date, bank, -random.between(9, 46), random.pick(['Librairie des Canuts', 'Bricolage du Centre', 'Ciné Lumière']), 'loisirs');
  if (random.chance(0.05)) add(date, bank, -random.between(29, 120), random.pick(['Boutique Atelier Lin', 'Magasin de sport']), 'vetements');
}

/** Investissements programmés : le 8 pour le PEA, le 15 pour la crypto. */
function generateInvestments(
  day: Day,
  buyAsset: (date: Date, bankId: string, ticker: string, quantity: number, noise: number) => void,
  buyFor: (date: Date, bankId: string, ticker: string, euros: number, noise: number) => void,
): void {
  const random = seededRandom(`${day.iso}|bourse`);
  const quarter = ((day.monthOffset % 3) + 3) % 3 === 0;

  if (day.day === 8) {
    buyAsset(day.date, DEMO_IDS.pea, 'MNDE.PA', 2, random.next());
    if (quarter) buyAsset(day.date, DEMO_IDS.pea, 'EMRG.PA', 3, random.next());
  }
  if (day.day === 15) {
    buyFor(day.date, DEMO_IDS.crypto, 'BTC', 70, random.next());
    buyFor(day.date, DEMO_IDS.crypto, 'ETH', 30, random.next());
  }
}

/**
 * Les événements qui font une année : la prime et les cadeaux de décembre, les
 * intérêts du Livret A, les vacances d'été, le vélo enfin acheté, deux missions
 * en freelance, un week-end à Annecy partagé avec Léo.
 */
function generateStories(
  today: Date,
  daysBefore: (days: number) => Date,
  monthStart: (offset: number) => Date,
  add: AddFn,
  transfer: TransferFn,
): void {
  const dayOf = (offset: number, dayOfMonth: number) => {
    const start = monthStart(offset);
    return utcDay(start.getUTCFullYear(), start.getUTCMonth(), dayOfMonth);
  };

  // Le mois de l'historique qui tombe sur `targetMonth` (0..11).
  const offsetOf = (targetMonth: number) => {
    const current = today.getUTCMonth();
    const back = (current - targetMonth + 12) % 12;
    return -back;
  };

  // ── Décembre : prime, cadeaux, repas de fête, intérêts ──
  const december = offsetOf(11);
  const decemberYear = monthStart(december).getUTCFullYear();
  add(dayOf(december, 18), DEMO_IDS.principale, 1_250, 'Prime de fin d’année', 'salaire');
  add(dayOf(december, 20), DEMO_IDS.principale, -800, 'Virement Économie Matelas de sécurité', 'epargne');
  add(dayOf(december, 20), DEMO_IDS.livretA, 800, 'Virement Économie Matelas de sécurité', 'epargne');
  add(dayOf(december, 6), DEMO_IDS.principale, -32.9, 'Librairie des Canuts', 'cadeaux');
  add(dayOf(december, 12), DEMO_IDS.principale, -89, 'Boutique Atelier Lin', 'cadeaux');
  add(dayOf(december, 16), DEMO_IDS.enLigne, -24.5, 'Marché de Noël', 'cadeaux');
  add(dayOf(december, 19), DEMO_IDS.principale, -46, 'Maison & Bois', 'cadeaux');
  add(dayOf(december, 14), DEMO_IDS.joint, -39.9, 'Sapin de Noël', 'maison');
  add(dayOf(december, 23), DEMO_IDS.joint, -86.4, 'Traiteur Gourmet', 'alimentation');
  add(dayOf(december, 31), DEMO_IDS.livretA, 128.47, `Intérêts Livret A ${decemberYear}`, 'epargne');

  // ── Août : une quinzaine en Bretagne ──
  const august = offsetOf(7);
  add(dayOf(august, 1), DEMO_IDS.enLigne, -92.4, 'Billet de train Lyon – Rennes', 'voyages');
  add(dayOf(august, 1), DEMO_IDS.joint, -680, 'Location vacances Bretagne', 'voyages');
  const holidays = seededRandom(`${monthStart(august).getUTCFullYear()}|bretagne`);
  for (let dayOfMonth = 2; dayOfMonth <= 15; dayOfMonth += 1) {
    if (holidays.chance(0.55)) {
      add(dayOf(august, dayOfMonth), DEMO_IDS.joint, -holidays.between(38, 84), holidays.pick(['Crêperie Ty Breizh', 'Le Goéland', 'Les Embruns']), 'voyages');
    }
    if (holidays.chance(0.35)) {
      add(dayOf(august, dayOfMonth), DEMO_IDS.joint, -holidays.between(12, 46), 'Épicerie du Port', 'alimentation');
    }
  }
  add(dayOf(august, 16), DEMO_IDS.enLigne, -92.4, 'Billet de train Rennes – Lyon', 'voyages');

  // ── Deux missions en freelance ──
  add(dayOf(-8, 12), DEMO_IDS.principale, 480, 'Mission freelance Atelier Pivoine', 'freelance');
  add(dayOf(-3, 14), DEMO_IDS.principale, 650, 'Mission freelance Maison Saba', 'freelance');

  // ── Le vélo : l'objectif atteint, l'argent ressort du livret ──
  transfer(dayOf(-2, 9), DEMO_IDS.livretA, DEMO_IDS.principale, 1_190, 'Virement Banque principale', 'Virement Livret A', 'epargne');
  add(dayOf(-2, 10), DEMO_IDS.principale, -1_189, 'Cycles du Canal', 'sport');

  // ── Week-end à Annecy, réglé ensuite entre Camille et Léo ──
  add(daysBefore(38), DEMO_IDS.enLigne, -240, 'Location week-end Annecy', 'voyages');
  add(daysBefore(37), DEMO_IDS.enLigne, -64.8, 'Brasserie du Lac', 'restaurants');
  add(daysBefore(35), DEMO_IDS.leoCourant, -120, 'Virement Camille — week-end Annecy', 'voyages');
  add(daysBefore(35), DEMO_IDS.principale, 120, 'Virement Léo — week-end Annecy', 'remboursements');

  // ── Le cadeau de Julie, avancé par Léo ──
  add(daysBefore(50), DEMO_IDS.principale, -30, 'Virement Léo — cadeau Julie', 'cadeaux');
  add(daysBefore(50), DEMO_IDS.leoCourant, 30, 'Virement Camille — cadeau Julie', 'remboursements');
}

// ─── Récurrences ────────────────────────────────────────────────────────────

interface RecurrenceSeed {
  key: string;
  bankId: string;
  /** Jour du mois de l'échéance. */
  day: number;
  amount: number;
  description: string;
  category: CategoryKey;
}

/**
 * Échéances connues, signées comme les écrit le serveur (+ revenu, − charge).
 *
 * Les jours sont étalés sur tout le mois : l'accueil montre les échéances des
 * sept prochains jours, et il en trouve toujours au moins une. Le virement
 * mensuel vers la banque en ligne n'y figure pas — les deux comptes sont
 * dépensables, et la prévision le compterait comme une sortie.
 */
const RECURRENCE_SEEDS: readonly RecurrenceSeed[] = [
  { key: 'salaire-camille', bankId: DEMO_IDS.principale, day: 1, amount: 2_736.4, description: 'Salaire Studio Lumen', category: 'salaire' },
  { key: 'transports', bankId: DEMO_IDS.principale, day: 2, amount: -74.1, description: 'Pass transports', category: 'transport' },
  { key: 'participation-camille', bankId: DEMO_IDS.principale, day: 3, amount: -1_000, description: 'Participation compte joint', category: 'vie-commune' },
  { key: 'japon', bankId: DEMO_IDS.principale, day: 5, amount: -300, description: 'Virement Économie Voyage au Japon', category: 'epargne' },
  { key: 'matelas', bankId: DEMO_IDS.principale, day: 5, amount: -175, description: 'Virement Économie Matelas de sécurité', category: 'epargne' },
  { key: 'sport', bankId: DEMO_IDS.principale, day: 6, amount: -34.9, description: 'Salle de sport', category: 'sport' },
  { key: 'mutuelle', bankId: DEMO_IDS.principale, day: 9, amount: -38.6, description: 'Mutuelle santé', category: 'assurances' },
  { key: 'presse', bankId: DEMO_IDS.principale, day: 13, amount: -9.99, description: 'Presse en ligne', category: 'abonnements' },
  { key: 'mobile', bankId: DEMO_IDS.principale, day: 16, amount: -15.99, description: 'Forfait mobile', category: 'internet' },
  { key: 'streaming', bankId: DEMO_IDS.principale, day: 19, amount: -13.49, description: 'Streaming vidéo', category: 'abonnements' },
  { key: 'musique', bankId: DEMO_IDS.principale, day: 21, amount: -11.99, description: 'Musique en ligne', category: 'abonnements' },
  { key: 'photos', bankId: DEMO_IDS.principale, day: 25, amount: -2.99, description: 'Stockage photos', category: 'abonnements' },
  { key: 'ceramique', bankId: DEMO_IDS.principale, day: 28, amount: -45, description: 'Atelier céramique', category: 'loisirs' },
  { key: 'participation-camille-joint', bankId: DEMO_IDS.joint, day: 3, amount: 1_000, description: 'Participation Camille', category: 'participations' },
  { key: 'participation-leo-joint', bankId: DEMO_IDS.joint, day: 3, amount: 900, description: 'Participation Léo', category: 'participations' },
  { key: 'loyer', bankId: DEMO_IDS.joint, day: 5, amount: -1_150, description: 'Loyer', category: 'loyer' },
  { key: 'assurance', bankId: DEMO_IDS.joint, day: 8, amount: -18.4, description: 'Assurance habitation', category: 'assurances' },
  { key: 'electricite', bankId: DEMO_IDS.joint, day: 15, amount: -64, description: 'Facture électricité', category: 'electricite' },
  { key: 'internet', bankId: DEMO_IDS.joint, day: 20, amount: -29.99, description: 'Box internet', category: 'internet' },
  { key: 'salaire-leo', bankId: DEMO_IDS.leoCourant, day: 28, amount: 2_614.35, description: 'Salaire Vélia Ingénierie', category: 'salaire' },
  { key: 'participation-leo', bankId: DEMO_IDS.leoCourant, day: 3, amount: -900, description: 'Participation compte joint', category: 'vie-commune' },
  { key: 'mobile-leo', bankId: DEMO_IDS.leoCourant, day: 7, amount: -9.99, description: 'Forfait mobile', category: 'internet' },
];

function buildRecurrences(today: Date, createdAt: Date): RecurrenceRow[] {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  return RECURRENCE_SEEDS.map((seed) => {
    // Le 31 n'existe pas tous les mois : l'échéance se replie sur le dernier jour.
    const dueIn = (monthIndex: number) => {
      const first = utcDay(year, monthIndex, 1);
      const length = daysInMonth(first.getUTCFullYear(), first.getUTCMonth());
      return utcDay(first.getUTCFullYear(), first.getUTCMonth(), Math.min(seed.day, length));
    };
    // Prochaine échéance strictement après aujourd'hui : celle du jour est
    // déjà passée en banque, et l'opération correspondante existe.
    let nextDue = dueIn(month);
    if (nextDue.getTime() <= today.getTime()) nextDue = dueIn(month + 1);

    return {
      id: `demo-recurrence-${seed.key}`,
      amount: seed.amount,
      frequency: 'MONTHLY',
      nextDue,
      description: seed.description,
      active: true,
      createdAt,
      updatedAt: createdAt,
      bankId: seed.bankId,
      categoryId: categoryId(seed.category),
    };
  });
}

// ─── Tricount ───────────────────────────────────────────────────────────────

/**
 * Dépenses avancées l'un pour l'autre. Le montant est la part due par l'autre
 * (convention de l'écran Tricount) ; le solde en cours penche du côté de
 * Camille, ce qui donne une carte verte à l'ouverture.
 */
function buildDebts(daysBefore: (days: number) => Date): DebtRow[] {
  const debt = (
    key: string,
    daysAgo: number,
    amount: number,
    description: string,
    paidBy: 'camille' | 'leo',
    settled: boolean,
  ): DebtRow => {
    const date = daysBefore(daysAgo);
    const fromUserId = paidBy === 'camille' ? DEMO_IDS.leo : DEMO_IDS.camille;
    const toUserId = paidBy === 'camille' ? DEMO_IDS.camille : DEMO_IDS.leo;
    return { id: `demo-debt-${key}`, amount, description, date, settled, createdAt: date, updatedAt: date, fromUserId, toUserId };
  };

  return [
    debt('courses', 3, 46.8, 'Courses du dimanche', 'camille', false),
    debt('sushi', 9, 36, 'Dîner chez Sushi Kyo', 'leo', false),
    debt('concert', 16, 59, 'Places de concert', 'camille', false),
    debt('taxi', 24, 11.75, 'Taxi retour de soirée', 'leo', false),
    debt('annecy', 38, 120, 'Week-end à Annecy — location', 'camille', true),
    debt('julie', 52, 30, 'Cadeau anniversaire Julie', 'leo', true),
    debt('essence', 70, 32.2, 'Plein d’essence', 'leo', true),
  ];
}
