/**
 * Serveur de démo — l'API Findy, en mémoire.
 *
 * `apiBase.ts` aiguille ici chaque requête `/api/*` et `/uploads/*` quand le
 * mode démo est actif : aucune ne quitte l'appareil. Chaque route répond avec
 * la forme exacte que renvoie `server/src/routes/*` — mêmes champs, mêmes
 * statuts, mêmes messages d'erreur — pour que les écrans ne puissent pas faire
 * la différence.
 *
 * Les calculs dérivés (solde d'un compte, reste à vivre, trajet de l'argent,
 * solde d'un tricount) ne sont pas réécrits : ce sont les fonctions pures du
 * serveur, importées telles quelles. La démo ne peut donc pas raconter autre
 * chose que la vraie application.
 *
 * Les écritures courantes (opérations, catégories, budgets, objectifs,
 * dépenses partagées, comptes…) modifient la base en mémoire ; ce qui n'a pas
 * de sens sans vrai serveur — liaison bancaire, import/export, IA, mot de
 * passe, photos — répond 403 avec `DEMO_UNAVAILABLE`, que les écrans affichent
 * tel quel. Ce module est chargé à la demande : il ne pèse rien hors démo.
 */

import { computeForecast, type ForecastRecurrence, type ForecastTransaction } from '../../../server/src/lib/forecast';
import { computeBalance } from '../../../server/src/lib/balance';
import { balanceHistory } from '../../../server/src/lib/balanceHistory';
import { buildTrace, buildTransferLinks, TRACE_WINDOW_MS, type TraceTxn } from '../../../server/src/lib/transferTrace';
import { FIVE_DAYS, looksLikeTransfer } from '../../../server/src/lib/transferUtils';
import { netBalance } from '../../../server/src/lib/debtBalance';
import {
  createDemoDatabase,
  type BankRow,
  type BudgetRow,
  type CategoryRow,
  type DebtRow,
  type DemoDatabase,
  type ObjectiveRow,
  type RecurrenceRow,
  type SpaceRow,
  type TransactionRow,
  type UserRow,
} from './dataset';
import { demoMarketQuotes } from './market';
import { DEMO_ID_PREFIX, DEMO_TOKEN, DEMO_UNAVAILABLE } from './mode';

// ─── Requêtes et réponses ───────────────────────────────────────────────────

export interface DemoRequest {
  method: string;
  /** Chemin seul, sans requête : `/api/banks`. */
  path: string;
  query: URLSearchParams;
  /** Corps JSON, ou champs texte d'un `FormData`. */
  body: Record<string, unknown>;
  /** Champs d'un `FormData` qui portaient un fichier (photo, logo). */
  files: string[];
}

export interface DemoResponse {
  status: number;
  /** Absent pour un 204. */
  body?: unknown;
}

type Handler = (request: DemoRequest, params: Record<string, string>) => DemoResponse;

const DAY_MS = 86_400_000;

/** Portée impossible à satisfaire, comme `NOTHING` dans `server/src/lib/scope.ts`. */
const NOTHING = ['__none__'];

function json(body: unknown, status = 200): DemoResponse {
  return { status, body };
}

function noContent(): DemoResponse {
  return { status: 204 };
}

function failure(status: number, error: string, extra: Record<string, unknown> = {}): DemoResponse {
  return { status, body: { error, ...extra } };
}

/**
 * Refus propre au mode démo.
 *
 * 403 et non 401 : `apiBase.ts` traite un 401 comme une session expirée et
 * recharge l'application. `message` double `error` parce que certains écrans
 * (synchronisation bancaire, tricount) lisent l'un, d'autres l'autre.
 */
function unavailable(): DemoResponse {
  return failure(403, DEMO_UNAVAILABLE, { message: DEMO_UNAVAILABLE });
}

// ─── Lectures tolérantes du corps, comme Express les laisse passer ──────────

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** `parseFloat` du serveur : accepte nombres et chaînes, `NaN` sinon. */
function float(value: unknown): number {
  return typeof value === 'number' ? value : parseFloat(String(value));
}

/**
 * `contains` de Prisma sur SQLite : un `LIKE`, insensible à la casse pour
 * l'ASCII seulement — « cafe » ne trouve pas « Café », « CAFÉ » trouve « café ».
 */
function likeContains(haystack: string, needle: string): boolean {
  const fold = (value: string) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return fold(haystack).includes(fold(needle));
}

/** Les quatre derniers chiffres d'une carte, comme `normalizeCardLast4` du serveur. */
function normalizeCardLast4(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const digits = value.replace(/\D/g, '');
  return digits.length === 0 ? null : digits.slice(-4);
}

// ─── Le serveur ─────────────────────────────────────────────────────────────

export class DemoServer {
  readonly db: DemoDatabase;
  private readonly clock: () => Date;
  private readonly routes: Array<{ method: string; pattern: RegExp; keys: string[]; handler: Handler }> = [];

  constructor(db: DemoDatabase, clock: () => Date = () => new Date()) {
    this.db = db;
    this.clock = clock;
    this.registerRoutes();
  }

  handle(request: DemoRequest): DemoResponse {
    const { path } = request;

    // Les images envoyées (avatars, logos) n'existent pas en démo.
    if (path.startsWith('/uploads/')) return failure(404, 'Route not found');

    for (const route of this.routes) {
      if (route.method !== request.method) continue;
      const match = route.pattern.exec(path);
      if (!match) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, index) => {
        params[key] = decodeURIComponent(match[index + 1]);
      });
      return route.handler(request, params);
    }

    // Route inconnue de la démo (écran de bureau, réglage serveur…) : un
    // message clair plutôt que le « Route not found » du vrai serveur.
    return failure(404, DEMO_UNAVAILABLE, { message: DEMO_UNAVAILABLE });
  }

  // ─── Routage ──────────────────────────────────────────────────────────────

  private on(method: string, path: string, handler: Handler): void {
    const keys: string[] = [];
    const source = path
      .split('/')
      .map((segment) => {
        if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        keys.push(segment.slice(1));
        return '([^/]+)';
      })
      .join('/');
    this.routes.push({ method, pattern: new RegExp(`^${source}/?$`), keys, handler });
  }

  private registerRoutes(): void {
    // ── Santé et réglages de serveur ──
    this.on('GET', '/api/health', () => json({ status: 'OK', message: 'Finance Tracker API is running!' }));

    // ── Authentification ──
    this.on('GET', '/api/auth/profiles', () => this.profiles());
    this.on('GET', '/api/auth/session', () => this.session());
    this.on('POST', '/api/auth/login', (request) => this.login(request));
    this.on('POST', '/api/auth/register', unavailable);
    this.on('PUT', '/api/auth/password', unavailable);

    // ── Espaces ──
    this.on('GET', '/api/spaces', () => this.listSpaces());
    this.on('POST', '/api/spaces', (request) => this.createSpace(request));
    this.on('PUT', '/api/spaces/:id', (request, params) => this.updateSpace(request, params.id));
    this.on('DELETE', '/api/spaces/:id', (_request, params) => this.deleteSpace(params.id));

    // ── Personnes ──
    this.on('GET', '/api/users', () => json(this.sortedUsers().map((user) => this.shapeUser(user))));
    this.on('GET', '/api/users/:id', (_request, params) => this.getUser(params.id));
    this.on('POST', '/api/users', (request) => this.createUser(request));
    this.on('PUT', '/api/users/:id/set-me', (_request, params) => this.setMe(params.id));
    this.on('PUT', '/api/users/:id', (request, params) => this.updateUser(request, params.id));
    this.on('DELETE', '/api/users/:id', (_request, params) => this.deleteUser(params.id));

    // ── Comptes ──
    this.on('GET', '/api/banks', (request) => this.listBanks(request));
    this.on('GET', '/api/banks/:id', (_request, params) => this.getBank(params.id));
    this.on('POST', '/api/banks', (request) => this.saveBank(request, null));
    this.on('PUT', '/api/banks/:id/restore', (_request, params) => this.restoreBank(params.id));
    this.on('PUT', '/api/banks/:id', (request, params) => this.saveBank(request, params.id));
    this.on('PATCH', '/api/banks/:id/spendable', (request, params) => this.setSpendable(request, params.id));
    this.on('DELETE', '/api/banks/:id/permanent', (_request, params) => this.deleteBank(params.id));
    this.on('DELETE', '/api/banks/:id', (_request, params) => this.archiveBank(params.id));

    // ── Catégories ──
    this.on('GET', '/api/categories', (request) => this.listCategories(request));
    this.on('GET', '/api/categories/:id', (_request, params) => this.getCategory(params.id));
    this.on('POST', '/api/categories', (request) => this.createCategory(request));
    this.on('POST', '/api/categories/:id/apply-keywords', unavailable);
    this.on('PUT', '/api/categories/:id', (request, params) => this.updateCategory(request, params.id));
    this.on('DELETE', '/api/categories/:id', (_request, params) => this.deleteCategory(params.id));

    // ── Opérations ──
    this.on('GET', '/api/transactions', (request) => this.listTransactions(request));
    this.on('POST', '/api/transactions/bulk-update', unavailable);
    this.on('POST', '/api/transactions/search', unavailable);
    this.on('GET', '/api/transactions/:id/trace', (request, params) => this.trace(request, params.id));
    this.on('GET', '/api/transactions/:id', (_request, params) => this.getTransaction(params.id));
    this.on('POST', '/api/transactions', (request) => this.createTransaction(request));
    this.on('PUT', '/api/transactions/:id', (request, params) => this.updateTransaction(request, params.id));
    this.on('DELETE', '/api/transactions/:id', (_request, params) => this.deleteTransaction(params.id));

    // ── Budgets et récurrences ──
    this.on('GET', '/api/budgets', (request) => this.listBudgets(request));
    this.on('POST', '/api/budgets', (request) => this.createBudget(request));
    this.on('PUT', '/api/budgets/:id', (request, params) => this.updateBudget(request, params.id));
    this.on('DELETE', '/api/budgets/:id', (_request, params) => this.deleteBudget(params.id));
    this.on('GET', '/api/recurrences', (request) => this.listRecurrences(request));

    // ── Tableau de bord ──
    this.on('GET', '/api/dashboard/overview', (request) => this.overview(request));
    this.on('GET', '/api/dashboard/forecast', (request) => this.forecast(request));

    // ── Objectifs ──
    this.on('GET', '/api/objectives', (request) => this.listObjectives(request));
    this.on('GET', '/api/objectives/:id/progress', (_request, params) => this.objectiveProgress(params.id));
    this.on('GET', '/api/objectives/:id', (_request, params) => this.getObjective(params.id));
    this.on('POST', '/api/objectives', (request) => this.createObjective(request));
    this.on('PUT', '/api/objectives/:id', (request, params) => this.updateObjective(request, params.id));
    this.on('PATCH', '/api/objectives/:id/archive', (_request, params) => this.archiveObjective(params.id));
    this.on('DELETE', '/api/objectives/:id', (_request, params) => this.deleteObjective(params.id));

    // ── Tricount ──
    this.on('GET', '/api/debts', (request) => this.listDebts(request));
    this.on('GET', '/api/debts/transfers', (request) => this.detectTransfers(request));
    this.on('POST', '/api/debts', (request) => this.createDebt(request));
    this.on('PUT', '/api/debts/:id', (request, params) => this.updateDebt(request, params.id));
    this.on('DELETE', '/api/debts/:id', (_request, params) => this.deleteDebt(params.id));

    // ── Cotations ──
    this.on('GET', '/api/market/price', (request) => {
      const symbols = request.query.get('symbols');
      if (!symbols) return failure(400, 'symbols query param required');
      return json(demoMarketQuotes(symbols.split(',')));
    });

    // ── Réglages : seule la lecture de la configuration IA a un sens ──
    // L'écran IA s'ouvre sur une configuration vide ; l'enregistrer, la
    // catégorisation, l'export et l'import sont refusés.
    this.on('GET', '/api/settings/ai', () => json({}));
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      this.on(method, '/api/settings/:rest', unavailable);
      this.on(method, '/api/settings/:rest/:more', unavailable);
    }

    // ── Liaison bancaire, tunnel, accès mobile : sans objet en démo ──
    this.on('GET', '/api/enablebanking/configured', () => failure(403, DEMO_UNAVAILABLE, { message: DEMO_UNAVAILABLE, configured: false }));
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      this.on(method, '/api/enablebanking/:a', unavailable);
      this.on(method, '/api/enablebanking/:a/:b', unavailable);
      this.on(method, '/api/enablebanking/:a/:b/:c', unavailable);
      this.on(method, '/api/tunnel', unavailable);
      this.on(method, '/api/tunnel/:a', unavailable);
      this.on(method, '/api/mobile-access', unavailable);
    }
  }

  // ─── Outils communs ───────────────────────────────────────────────────────

  private now(): Date {
    return this.clock();
  }

  private newId(kind: string): string {
    const id = `${DEMO_ID_PREFIX}${kind}-n${this.db.nextId}`;
    this.db.nextId += 1;
    return id;
  }

  private user(id: string | null | undefined): UserRow | undefined {
    return id ? this.db.users.find((user) => user.id === id) : undefined;
  }

  private space(id: string): SpaceRow | undefined {
    return this.db.spaces.find((space) => space.id === id);
  }

  private bank(id: string): BankRow | undefined {
    return this.db.banks.find((bank) => bank.id === id);
  }

  private category(id: string | null | undefined): CategoryRow | undefined {
    return id ? this.db.categories.find((category) => category.id === id) : undefined;
  }

  private sortedUsers(): UserRow[] {
    return [...this.db.users].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /** Espaces dont la personne est membre, dans l'ordre d'adhésion. */
  private spaceIdsFor(userId: string | null): string[] {
    if (!userId) return [];
    return this.db.members.filter((member) => member.userId === userId).map((member) => member.spaceId);
  }

  private membersOf(spaceId: string): UserRow[] {
    return this.db.members
      .filter((member) => member.spaceId === spaceId)
      .map((member) => this.user(member.userId))
      .filter((user): user is UserRow => Boolean(user));
  }

  /**
   * `resolveScope` du serveur : un `spaceId` autorisé restreint à cet espace,
   * un `spaceId` étranger ne rend rien, son absence rend tous ceux du profil.
   */
  private scope(query: URLSearchParams): string[] {
    const allowed = this.spaceIdsFor(this.db.sessionUserId);
    if (allowed.length === 0) return NOTHING;
    const spaceId = query.get('spaceId');
    if (spaceId) return allowed.includes(spaceId) ? [spaceId] : NOTHING;
    return allowed;
  }

  private bankIdsIn(scope: string[]): Set<string> {
    return new Set(this.db.banks.filter((bank) => scope.includes(bank.spaceId)).map((bank) => bank.id));
  }

  /** Comptes de tous les espaces d'une personne (`bankIdsForUser` du serveur). */
  private bankIdsForUser(userId: string): Set<string> {
    return this.bankIdsIn(this.spaceIdsFor(userId));
  }

  /** Ordre de `orderBy: { date: 'desc' }` — départagé par l'ordre d'écriture. */
  private byDateDesc(a: TransactionRow, b: TransactionRow): number {
    return b.date.getTime() - a.date.getTime() || b.createdAt.getTime() - a.createdAt.getTime();
  }

  /**
   * `resolveSpaceForUsers` du serveur : l'espace dont les membres sont
   * exactement ces personnes, créé au besoin — c'est ainsi que cocher des
   * membres sur un compte le range dans le bon espace.
   */
  private resolveSpaceForUsers(userIds: string[]): string {
    const unique = [...new Set(userIds)];
    const key = [...unique].sort().join('|');
    const match = this.db.spaces.find(
      (space) => this.membersOf(space.id).map((user) => user.id).sort().join('|') === key,
    );
    if (match) return match.id;

    const now = this.now();
    const users = unique.map((id) => this.user(id)).filter((user): user is UserRow => Boolean(user));
    const space: SpaceRow = {
      id: this.newId('space'),
      name: unique.length === 1 ? users[0]?.name ?? 'Espace' : users.map((user) => user.name).join(' & '),
      kind: unique.length === 1 ? 'PERSONAL' : 'SHARED',
      color: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.spaces.push(space);
    for (const userId of unique) {
      this.db.members.push({ id: this.newId('member'), spaceId: space.id, userId, createdAt: now });
    }
    return space.id;
  }

  // ─── Formes renvoyées, calquées sur les `include` / `select` Prisma ───────

  private shapeAuthUser(user: UserRow) {
    const { passwordHash, ...rest } = user;
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
      spaces: this.spaceIdsFor(user.id).map((id) => this.space(id)).filter(Boolean),
    };
  }

  /** `sanitizeUser` de `routes/users.ts` : espaces aplatis et comptes de ces espaces. */
  private shapeUser(user: UserRow) {
    const { passwordHash, ...rest } = user;
    const spaces = this.spaceIdsFor(user.id)
      .map((id) => this.space(id))
      .filter((space): space is SpaceRow => Boolean(space));
    const banks = spaces.flatMap((space) => this.db.banks.filter((bank) => bank.spaceId === space.id));
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
      spaces: spaces.map((space) => ({ id: space.id, name: space.name, kind: space.kind })),
      userBanks: banks.map((bank) => ({ userId: user.id, bankId: bank.id, bank: { ...bank } })),
    };
  }

  private shapeSpace(space: SpaceRow) {
    const members = this.membersOf(space.id);
    return {
      id: space.id,
      name: space.name,
      kind: space.kind,
      color: space.color,
      members: members.map((user) => ({ id: user.id, name: user.name, avatar: user.avatar })),
      memberIds: members.map((user) => user.id),
    };
  }

  /** `withSpaceMembers` de `routes/banks.ts`. */
  private shapeBank(bank: BankRow) {
    const space = this.space(bank.spaceId);
    const memberRows = this.db.members.filter((member) => member.spaceId === bank.spaceId);
    const users = memberRows
      .map((member) => this.user(member.userId))
      .filter((user): user is UserRow => Boolean(user))
      .map((user) => ({ id: user.id, name: user.name, avatar: user.avatar }));
    return {
      ...bank,
      space: space
        ? {
            ...space,
            members: memberRows.map((member) => {
              const user = this.user(member.userId);
              return { ...member, user: user ? { id: user.id, name: user.name, avatar: user.avatar } : null };
            }),
          }
        : null,
      initialBalance: bank.balance,
      users,
      userBanks: users.map((user) => ({ userId: user.id, bankId: bank.id, user })),
      spaceName: space?.name ?? null,
    };
  }

  private categorySelect(id: string | null) {
    const category = this.category(id);
    return category
      ? { id: category.id, name: category.name, type: category.type, color: category.color, icon: category.icon }
      : null;
  }

  /** Une opération telle que la liste `GET /api/transactions` la renvoie. */
  private shapeListedTransaction(transaction: TransactionRow) {
    const bank = this.bank(transaction.bankId);
    if (!bank) return { ...transaction, category: this.categorySelect(transaction.categoryId) };

    const space = this.space(bank.spaceId);
    const memberRows = this.db.members.filter((member) => member.spaceId === bank.spaceId);
    const users = memberRows
      .map((member) => this.user(member.userId))
      .filter((user): user is UserRow => Boolean(user))
      .map((user) => ({ id: user.id, name: user.name }));

    return {
      ...transaction,
      bank: {
        ...bank,
        space: space
          ? {
              ...space,
              members: memberRows.map((member) => {
                const user = this.user(member.userId);
                return { ...member, user: user ? { id: user.id, name: user.name } : null };
              }),
            }
          : null,
        users,
        userBanks: users.map((user) => ({ userId: user.id, bankId: bank.id, user })),
      },
      category: this.categorySelect(transaction.categoryId),
    };
  }

  /** Une opération telle que la renvoient la création, la modification et `GET /:id`. */
  private shapeSavedTransaction(transaction: TransactionRow) {
    const bank = this.bank(transaction.bankId);
    return {
      ...transaction,
      bank: bank
        ? { id: bank.id, name: bank.name, shortName: bank.shortName, color: bank.color, image: bank.image }
        : null,
      category: this.categorySelect(transaction.categoryId),
    };
  }

  /** Mouvements d'un compte : ceux portant une quantité, et les autres. */
  private flows(bankId: string, before?: Date) {
    let assetFlow = 0;
    let cashFlow = 0;
    for (const transaction of this.db.transactions) {
      if (transaction.bankId !== bankId) continue;
      if (before && transaction.date.getTime() >= before.getTime()) continue;
      if (transaction.quantity !== null) assetFlow += transaction.amount;
      else cashFlow += transaction.amount;
    }
    return { assetFlow, cashFlow };
  }

  // ─── Authentification ─────────────────────────────────────────────────────

  private profiles(): DemoResponse {
    return json(
      this.sortedUsers().map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        isMe: user.isMe,
        hasPassword: Boolean(user.passwordHash),
        spaces: [],
      })),
    );
  }

  private session(): DemoResponse {
    if (!this.db.sessionUserId) return failure(401, 'Session expirée ou absente.');
    const user = this.user(this.db.sessionUserId);
    if (!user) return failure(404, 'Profil introuvable');
    return json(this.shapeAuthUser(user));
  }

  private login(request: DemoRequest): DemoResponse {
    const userId = text(request.body.userId);
    if (!userId) return failure(400, 'userId is required');
    const user = this.user(userId);
    if (!user) return failure(404, 'Profil introuvable');

    // Le profil connecté devient « Moi », un seul à la fois.
    for (const candidate of this.db.users) candidate.isMe = candidate.id === user.id;
    this.db.sessionUserId = user.id;
    return json({ ...this.shapeAuthUser(user), token: DEMO_TOKEN });
  }

  // ─── Espaces ──────────────────────────────────────────────────────────────

  private listSpaces(): DemoResponse {
    const ids = new Set(this.spaceIdsFor(this.db.sessionUserId));
    const spaces = this.db.spaces
      .filter((space) => ids.has(space.id))
      // Perso d'abord, puis les partagés, dans l'ordre de création.
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.createdAt.getTime() - b.createdAt.getTime());
    return json(spaces.map((space) => this.shapeSpace(space)));
  }

  private createSpace(request: DemoRequest): DemoResponse {
    const name = text(request.body.name);
    const memberIds = request.body.memberIds;
    if (!name || !name.trim()) return failure(400, 'Le nom est requis');
    const unique = Array.isArray(memberIds) ? [...new Set(memberIds.map(String))] : [];
    if (!Array.isArray(memberIds) || unique.length < 2) return failure(400, 'Un groupe demande au moins deux membres');
    if (unique.some((id) => !this.user(id))) return failure(400, 'Membre inconnu');
    if (!this.db.sessionUserId || !unique.includes(this.db.sessionUserId)) {
      return failure(403, 'Vous devez faire partie de l’espace que vous créez.');
    }

    const now = this.now();
    const space: SpaceRow = { id: this.newId('space'), name: name.trim(), kind: 'SHARED', color: null, createdAt: now, updatedAt: now };
    this.db.spaces.push(space);
    for (const userId of unique) {
      this.db.members.push({ id: this.newId('member'), spaceId: space.id, userId, createdAt: now });
    }
    return json(this.shapeSpace(space), 201);
  }

  private updateSpace(request: DemoRequest, id: string): DemoResponse {
    const space = this.space(id);
    if (!space) return failure(404, 'Espace introuvable');
    if (!this.spaceIdsFor(this.db.sessionUserId).includes(id)) return failure(403, 'Espace inaccessible.');

    const memberIds = request.body.memberIds;
    if (Array.isArray(memberIds)) {
      const unique = [...new Set(memberIds.map(String))];
      const min = space.kind === 'SHARED' ? 2 : 1;
      if (unique.length < min) return failure(400, `Cet espace demande au moins ${min} membre(s)`);
      const now = this.now();
      this.db.members = this.db.members.filter((member) => member.spaceId !== id);
      for (const userId of unique) {
        this.db.members.push({ id: this.newId('member'), spaceId: id, userId, createdAt: now });
      }
    }

    if (request.body.name !== undefined) space.name = String(request.body.name).trim();
    space.updatedAt = this.now();
    return json(this.shapeSpace(space));
  }

  private deleteSpace(id: string): DemoResponse {
    if (!this.spaceIdsFor(this.db.sessionUserId).includes(id)) return failure(403, 'Espace inaccessible.');

    const banks = this.db.banks.filter((bank) => bank.spaceId === id).length;
    const objectives = this.db.objectives.filter((objective) => objective.spaceId === id).length;
    const budgets = this.db.budgets.filter((budget) => budget.spaceId === id).length;
    const categories = this.db.categories.filter((category) => category.spaceId === id).length;
    if (banks + objectives + budgets + categories > 0) {
      return failure(
        409,
        `Cet espace contient encore ${banks} compte(s), ${objectives} objectif(s), ${budgets} budget(s) et ${categories} catégorie(s). Déplacez-les avant de le supprimer.`,
      );
    }

    this.db.spaces = this.db.spaces.filter((space) => space.id !== id);
    this.db.members = this.db.members.filter((member) => member.spaceId !== id);
    return noContent();
  }

  // ─── Personnes ────────────────────────────────────────────────────────────

  private getUser(id: string): DemoResponse {
    const user = this.user(id);
    return user ? json(this.shapeUser(user)) : failure(404, 'User not found');
  }

  private createUser(request: DemoRequest): DemoResponse {
    const name = text(request.body.name);
    if (!name) return failure(400, 'Name is required');
    if (name.length > 20) return failure(400, 'Name must be 20 characters or less');

    const now = this.now();
    const user: UserRow = {
      id: this.newId('user'),
      name,
      avatar: null,
      isMe: this.db.users.length === 0,
      passwordHash: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.users.push(user);
    return json(this.shapeUser(user), 201);
  }

  private setMe(id: string): DemoResponse {
    if (!this.user(id)) return failure(404, 'User not found');
    for (const user of this.db.users) user.isMe = user.id === id;
    return json(this.sortedUsers().map((user) => this.shapeUser(user)));
  }

  private updateUser(request: DemoRequest, id: string): DemoResponse {
    // Une photo ne peut être enregistrée nulle part : la démo n'a pas de disque.
    if (request.files.includes('avatar')) return unavailable();

    const name = text(request.body.name);
    if (name && name.length > 20) return failure(400, 'Name must be 20 characters or less');

    const user = this.user(id);
    if (!user) return failure(500, 'Failed to update user');
    if (name !== undefined) user.name = name;
    user.updatedAt = this.now();
    return json(this.shapeUser(user));
  }

  /**
   * Suppression d'un profil — mêmes cascades que le schéma Prisma.
   *
   * Partent avec lui ses appartenances aux espaces et les dettes où il figure ;
   * les espaces, leurs comptes et leurs opérations restent.
   */
  private deleteUser(id: string): DemoResponse {
    if (!this.user(id)) return failure(500, 'Failed to delete user');

    this.db.users = this.db.users.filter((user) => user.id !== id);
    this.db.members = this.db.members.filter((member) => member.userId !== id);
    this.db.debts = this.db.debts.filter((debt) => debt.fromUserId !== id && debt.toUserId !== id);
    if (this.db.sessionUserId === id) this.db.sessionUserId = null;
    return noContent();
  }

  // ─── Comptes ──────────────────────────────────────────────────────────────

  private listBanks(request: DemoRequest): DemoResponse {
    const scope = this.scope(request.query);
    const archived = request.query.get('archived');

    const banks = this.db.banks
      .filter((bank) => scope.includes(bank.spaceId))
      .filter((bank) => archived === null || bank.archived === (archived === 'true'))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const now = this.now();
    const historyStart = new Date(now);
    historyStart.setUTCMonth(historyStart.getUTCMonth() - 6);

    return json(
      banks.map((bank) => {
        const balance = computeBalance(bank, this.flows(bank.id));
        // Historique du solde : pour un compte d'investissement, un achat est
        // du capital investi et non une sortie — même règle que
        // `computeBalance`. Le serveur passe les montants bruts à
        // `balanceHistory`, ce qui fait plonger la courbe d'un PEA à chaque
        // achat ; la démo ne reproduit pas ce défaut.
        const history = this.db.transactions
          .filter((transaction) => transaction.bankId === bank.id && transaction.date.getTime() >= historyStart.getTime())
          .map((transaction) => ({
            date: transaction.date,
            amount:
              bank.accountType === 'INVESTMENT' && transaction.quantity !== null
                ? -transaction.amount
                : transaction.amount,
          }));

        return {
          ...this.shapeBank(bank),
          initialBalance: bank.balance,
          balance,
          ...balanceHistory(balance, history, 6, now),
        };
      }),
    );
  }

  private getBank(id: string): DemoResponse {
    const bank = this.bank(id);
    return bank ? json(this.shapeBank(bank)) : failure(404, 'Bank not found');
  }

  /**
   * Création (`id` nul) ou modification d'un compte.
   *
   * Le formulaire envoie un `FormData` : un champ `data` en JSON, et
   * `cardLast4` à la racine. Les règles de repli sont celles de la route :
   * un champ vide garde la valeur existante.
   */
  private saveBank(request: DemoRequest, id: string | null): DemoResponse {
    if (request.files.includes('image')) return unavailable();

    const { body } = request;
    let data: Record<string, unknown> = {};
    if (typeof body.data === 'string') {
      try {
        data = JSON.parse(body.data) as Record<string, unknown>;
      } catch {
        data = {};
      }
    } else if (body.data && typeof body.data === 'object') {
      data = body.data as Record<string, unknown>;
    }
    const field = (key: string) => (data[key] || body[key]) as unknown;
    const userIds = Array.isArray(data.userIds) ? data.userIds.map(String) : [];
    const now = this.now();

    if (id === null) {
      const name = text(field('name'));
      if (!name || userIds.length === 0) return failure(400, 'Name and at least one user are required');

      const createdAt = text(field('createdAt'));
      const balance = data.balance !== undefined ? data.balance : body.balance;
      const bank: BankRow = {
        id: this.newId('bank'),
        name,
        shortName: text(field('shortName')) ?? null,
        color: text(field('color')) || '#3b82f6',
        image: null,
        iban: text(field('iban')) ?? null,
        balance: float(balance) || 0,
        accountType: (text(field('accountType')) as BankRow['accountType']) || 'CURRENT',
        archived: false,
        spendable: null,
        cardLast4: normalizeCardLast4(body.cardLast4) ?? null,
        brandLogo: null,
        brandColors: null,
        brandLogoLight: null,
        archivedAt: null,
        createdAt: createdAt ? new Date(createdAt) : now,
        updatedAt: now,
        ebAspspName: null,
        ebAspspCountry: null,
        ebState: null,
        ebSessionId: null,
        ebAccountUid: null,
        ebStatus: null,
        ebLinkedAt: null,
        ebExpiresAt: null,
        ebLastSyncAt: null,
        spaceId: this.resolveSpaceForUsers(userIds),
      };
      this.db.banks.push(bank);
      return json(this.shapeBank(bank), 201);
    }

    const bank = this.bank(id);
    if (!bank) return failure(500, 'Failed to update bank');

    const name = text(field('name'));
    const shortName = text(field('shortName'));
    const color = text(field('color'));
    const iban = text(field('iban'));
    if (name !== undefined) bank.name = name;
    if (shortName !== undefined) bank.shortName = shortName;
    if (color !== undefined) bank.color = color;
    if (iban !== undefined) bank.iban = iban;
    const balance = data.balance !== undefined ? float(data.balance) : float(body.balance);
    if (!Number.isNaN(balance)) bank.balance = balance;
    const accountType = data.accountType !== undefined ? data.accountType : body.accountType || 'CURRENT';
    if (accountType === 'CURRENT' || accountType === 'SAVINGS' || accountType === 'INVESTMENT') bank.accountType = accountType;
    const createdAt = text(field('createdAt'));
    if (createdAt) bank.createdAt = new Date(createdAt);
    if ('cardLast4' in body) bank.cardLast4 = normalizeCardLast4(body.cardLast4) ?? null;
    if (userIds.length > 0) bank.spaceId = this.resolveSpaceForUsers(userIds);
    if (typeof body.spaceId === 'string' && body.spaceId) bank.spaceId = body.spaceId;
    bank.updatedAt = now;
    return json(this.shapeBank(bank));
  }

  private restoreBank(id: string): DemoResponse {
    const bank = this.bank(id);
    if (!bank) return failure(500, 'Failed to restore bank');
    bank.archived = false;
    return json(this.shapeBank(bank));
  }

  private setSpendable(request: DemoRequest, id: string): DemoResponse {
    const scope = this.scope(request.query);
    const bank = this.db.banks.find((candidate) => candidate.id === id && scope.includes(candidate.spaceId));
    if (!bank) return failure(404, 'Compte introuvable');

    const raw = request.body.spendable;
    bank.spendable = raw === null || raw === undefined ? null : Boolean(raw);
    return json({ id: bank.id, name: bank.name, spendable: bank.spendable });
  }

  private deleteBank(id: string): DemoResponse {
    const bank = this.bank(id);
    if (!bank) return failure(404, 'Bank not found');

    const deletedTransactions = this.db.transactions.filter((transaction) => transaction.bankId === id).length;
    this.db.transactions = this.db.transactions.filter((transaction) => transaction.bankId !== id);
    this.db.budgets = this.db.budgets.filter((budget) => budget.bankId !== id);
    this.db.recurrences = this.db.recurrences.filter((recurrence) => recurrence.bankId !== id);
    this.db.banks = this.db.banks.filter((candidate) => candidate.id !== id);
    return json({ message: 'Bank permanently deleted', bankName: bank.name, deletedTransactions });
  }

  private archiveBank(id: string): DemoResponse {
    const bank = this.bank(id);
    if (!bank) return failure(500, 'Failed to archive bank');
    bank.archived = true;
    return noContent();
  }

  // ─── Catégories ───────────────────────────────────────────────────────────

  private shapeCategory(category: CategoryRow) {
    return {
      ...category,
      _count: {
        transactions: this.db.transactions.filter((transaction) => transaction.categoryId === category.id).length,
        budgets: this.db.budgets.filter((budget) => budget.categoryId === category.id).length,
        recurrences: this.db.recurrences.filter((recurrence) => recurrence.categoryId === category.id).length,
      },
      keywords: [],
    };
  }

  private listCategories(request: DemoRequest): DemoResponse {
    const scope = this.scope(request.query);
    const type = request.query.get('type');
    const categories = this.db.categories
      .filter((category) => !type || category.type === type)
      // Catalogue commun (`spaceId` nul) toujours visible, le reste par espace.
      .filter((category) => category.spaceId === null || scope.includes(category.spaceId))
      // Ordre binaire de SQLite : « Électricité » après « Voyages », comme en vrai.
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return json(categories.map((category) => this.shapeCategory(category)));
  }

  private getCategory(id: string): DemoResponse {
    const category = this.category(id);
    return category ? json(this.shapeCategory(category)) : failure(404, 'Category not found');
  }

  private createCategory(request: DemoRequest): DemoResponse {
    const name = text(request.body.name);
    const type = text(request.body.type);
    if (!name || !type) return failure(400, 'Name and type are required');
    if (type !== 'INCOME' && type !== 'EXPENSE' && type !== 'FIXED') return failure(400, 'Invalid category type');

    const now = this.now();
    const category: CategoryRow = {
      id: this.newId('cat'),
      name,
      type,
      color: text(request.body.color) || '#6b7280',
      icon: text(request.body.icon) || null,
      spaceId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.categories.push(category);
    return json(this.shapeCategory(category), 201);
  }

  private updateCategory(request: DemoRequest, id: string): DemoResponse {
    const { name, type, color, icon } = request.body;
    if (type && type !== 'INCOME' && type !== 'EXPENSE' && type !== 'FIXED') return failure(400, 'Invalid category type');

    const category = this.category(id);
    if (!category) return failure(404, 'Category not found');
    if (name !== undefined) category.name = String(name);
    if (type !== undefined) category.type = type as CategoryRow['type'];
    if (color !== undefined) category.color = String(color);
    if (icon !== undefined) category.icon = icon === null ? null : String(icon);
    category.updatedAt = this.now();
    return json(this.shapeCategory(category));
  }

  /** Les opérations perdent leur catégorie ; budgets et récurrences liés partent avec elle. */
  private deleteCategory(id: string): DemoResponse {
    if (!this.category(id)) return failure(404, 'Category not found');

    for (const transaction of this.db.transactions) {
      if (transaction.categoryId === id) transaction.categoryId = null;
    }
    this.db.budgets = this.db.budgets.filter((budget) => budget.categoryId !== id);
    this.db.recurrences = this.db.recurrences.filter((recurrence) => recurrence.categoryId !== id);
    this.db.categories = this.db.categories.filter((category) => category.id !== id);
    return noContent();
  }

  // ─── Opérations ───────────────────────────────────────────────────────────

  private listTransactions(request: DemoRequest): DemoResponse {
    const { query } = request;
    const scopeBankIds = this.bankIdsIn(this.scope(query));

    const amountSign = query.get('amountSign');
    const bankId = query.get('bankId');
    const accountType = query.get('accountType');
    const excludeAccountType = query.get('excludeAccountType');
    const categoryId = query.get('categoryId');
    const checked = query.get('checked');
    const startDate = query.get('startDate');
    const endDate = query.get('endDate');
    const search = query.get('search')?.trim() ?? '';
    const limit = query.get('limit');
    const offset = query.get('offset');

    const from = startDate ? new Date(startDate) : null;
    const to = endDate ? new Date(endDate) : null;
    // Deux variantes, comme la route : telle que saisie, et sans accents.
    const normalized = search.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

    const matches = this.db.transactions.filter((transaction) => {
      if (!scopeBankIds.has(transaction.bankId)) return false;
      if ((amountSign === 'positive' || amountSign === 'income') && !(transaction.amount > 0)) return false;
      if ((amountSign === 'negative' || amountSign === 'expense') && !(transaction.amount < 0)) return false;
      if (bankId && transaction.bankId !== bankId) return false;
      const bank = this.bank(transaction.bankId);
      if (accountType && bank?.accountType !== accountType) return false;
      if (excludeAccountType && bank?.accountType === excludeAccountType) return false;
      if (categoryId && transaction.categoryId !== categoryId) return false;
      if (checked !== null && checked !== '' && transaction.checked !== (checked === 'true')) return false;
      if (from && transaction.date.getTime() < from.getTime()) return false;
      if (to && transaction.date.getTime() > to.getTime()) return false;
      if (search && !likeContains(transaction.description, search) && !likeContains(transaction.description, normalized)) {
        return false;
      }
      return true;
    });

    const skip = offset ? parseInt(offset, 10) || 0 : 0;
    const take = limit ? parseInt(limit, 10) : undefined;
    const page = matches.sort((a, b) => this.byDateDesc(a, b)).slice(skip, take !== undefined ? skip + take : undefined);
    return json(page.map((transaction) => this.shapeListedTransaction(transaction)));
  }

  private getTransaction(id: string): DemoResponse {
    const transaction = this.db.transactions.find((candidate) => candidate.id === id);
    return transaction ? json(this.shapeSavedTransaction(transaction)) : failure(404, 'Transaction not found');
  }

  private createTransaction(request: DemoRequest): DemoResponse {
    const { amount, description, date, bankId, categoryId, unitPrice, quantity, ticker, assetType } = request.body;
    if (amount === undefined || amount === null || !description || !bankId) {
      return failure(400, 'Amount, description, and bankId are required');
    }
    if (!this.bank(String(bankId))) return failure(404, 'Bank not found');
    if (categoryId && !this.category(String(categoryId))) return failure(404, 'Category not found');

    const now = this.now();
    const transaction: TransactionRow = {
      id: this.newId('tx'),
      amount: float(amount),
      description: String(description),
      date: date ? new Date(String(date)) : now,
      checked: false,
      unitPrice: unitPrice ? float(unitPrice) : null,
      quantity: quantity ? float(quantity) : null,
      ticker: text(ticker) || null,
      assetType: text(assetType) || null,
      externalId: null,
      currency: null,
      balanceAfterTransaction: null,
      status: 'BOOK',
      aiCategorized: false,
      createdAt: now,
      updatedAt: now,
      bankId: String(bankId),
      categoryId: categoryId ? String(categoryId) : null,
    };
    this.db.transactions.push(transaction);
    return json(this.shapeSavedTransaction(transaction), 201);
  }

  /** Mise à jour partielle, avec les mêmes conditions que la route (`amount` nul ignoré, etc.). */
  private updateTransaction(request: DemoRequest, id: string): DemoResponse {
    const { amount, description, date, categoryId, bankId, unitPrice, quantity, ticker, assetType } = request.body;
    if (bankId && !this.bank(String(bankId))) return failure(404, 'Bank not found');
    if (categoryId && !this.category(String(categoryId))) return failure(404, 'Category not found');

    const transaction = this.db.transactions.find((candidate) => candidate.id === id);
    if (!transaction) return failure(404, 'Transaction not found');

    if (amount) transaction.amount = float(amount);
    if (description) transaction.description = String(description);
    if (date) transaction.date = new Date(String(date));
    if (categoryId !== undefined) transaction.categoryId = categoryId ? String(categoryId) : null;
    if (bankId !== undefined && bankId) transaction.bankId = String(bankId);
    if (unitPrice !== undefined) transaction.unitPrice = unitPrice ? float(unitPrice) : null;
    if (quantity !== undefined) transaction.quantity = quantity ? float(quantity) : null;
    if (ticker !== undefined) transaction.ticker = text(ticker) || null;
    if (assetType !== undefined) transaction.assetType = text(assetType) || null;
    transaction.updatedAt = this.now();
    return json(this.shapeSavedTransaction(transaction));
  }

  private deleteTransaction(id: string): DemoResponse {
    if (!this.db.transactions.some((transaction) => transaction.id === id)) return failure(404, 'Transaction not found');
    this.db.transactions = this.db.transactions.filter((transaction) => transaction.id !== id);
    return noContent();
  }

  /** `GET /api/transactions/:id/trace` — le trajet de l'argent, par `buildTrace` du serveur. */
  private trace(request: DemoRequest, id: string): DemoResponse {
    const focus = this.db.transactions.find((transaction) => transaction.id === id);
    if (!focus) return failure(404, 'Transaction not found');

    const scope = this.scope(request.query);
    const focusBank = this.bank(focus.bankId);
    if (!focusBank || !scope.includes(focusBank.spaceId)) return failure(404, 'Transaction not found');

    const scopeBankIds = this.bankIdsIn(scope);
    const windowStart = focus.date.getTime() - TRACE_WINDOW_MS;
    const windowEnd = focus.date.getTime() + TRACE_WINDOW_MS;

    const nodes: TraceTxn[] = this.db.transactions
      .filter(
        (transaction) =>
          scopeBankIds.has(transaction.bankId) &&
          transaction.date.getTime() >= windowStart &&
          transaction.date.getTime() <= windowEnd,
      )
      .map(({ id: txnId, amount, date, description, bankId, categoryId, checked }) => ({
        id: txnId,
        amount,
        date,
        description,
        bankId,
        categoryId,
        checked,
      }));

    const result = buildTrace(id, nodes, buildTransferLinks(nodes));

    const bankIds = new Set(result.nodes.map((node) => node.bankId));
    const categoryIds = new Set(result.nodes.map((node) => node.categoryId).filter((value): value is string => Boolean(value)));

    return json({
      ...result,
      banks: this.db.banks
        .filter((bank) => bankIds.has(bank.id))
        .map((bank) => ({ id: bank.id, name: bank.name, shortName: bank.shortName, color: bank.color, image: bank.image })),
      categories: this.db.categories
        .filter((category) => categoryIds.has(category.id))
        .map((category) => ({ id: category.id, name: category.name, icon: category.icon, color: category.color })),
    });
  }

  // ─── Budgets et récurrences ───────────────────────────────────────────────

  private shapeBudget(budget: BudgetRow) {
    return { ...budget, category: this.categorySelect(budget.categoryId) };
  }

  private listBudgets(request: DemoRequest): DemoResponse {
    const scope = this.scope(request.query);
    const categoryId = request.query.get('categoryId');
    const budgets = this.db.budgets
      .filter((budget) => budget.spaceId !== null && scope.includes(budget.spaceId))
      .filter((budget) => !categoryId || budget.categoryId === categoryId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return json(budgets.map((budget) => this.shapeBudget(budget)));
  }

  private createBudget(request: DemoRequest): DemoResponse {
    const { amount, period, startDate, categoryId, spaceId, userId } = request.body;
    if (!amount || !categoryId) return failure(400, 'Amount and categoryId are required');
    if (!this.category(String(categoryId))) return failure(500, 'Failed to create budget');

    const now = this.now();
    const budget: BudgetRow = {
      id: this.newId('budget'),
      amount: float(amount),
      period: text(period) || 'MONTHLY',
      startDate: startDate ? new Date(String(startDate)) : now,
      createdAt: now,
      updatedAt: now,
      bankId: null,
      categoryId: String(categoryId),
      // L'espace suit le sélecteur ; à défaut, l'espace personnel.
      spaceId: text(spaceId) || (text(userId) ? this.resolveSpaceForUsers([String(userId)]) : null),
    };
    this.db.budgets.push(budget);
    return json(this.shapeBudget(budget), 201);
  }

  private updateBudget(request: DemoRequest, id: string): DemoResponse {
    const budget = this.db.budgets.find((candidate) => candidate.id === id);
    if (!budget) return failure(404, 'Budget not found');

    const { amount, period, startDate, spaceId } = request.body;
    if (amount) budget.amount = float(amount);
    if (period) budget.period = String(period);
    if (startDate) budget.startDate = new Date(String(startDate));
    if (spaceId !== undefined) budget.spaceId = spaceId === null ? null : String(spaceId);
    budget.updatedAt = this.now();
    return json(this.shapeBudget(budget));
  }

  private deleteBudget(id: string): DemoResponse {
    if (!this.db.budgets.some((budget) => budget.id === id)) return failure(404, 'Budget not found');
    this.db.budgets = this.db.budgets.filter((budget) => budget.id !== id);
    return noContent();
  }

  private shapeRecurrence(recurrence: RecurrenceRow, bankFields: 'short' | 'full') {
    const bank = recurrence.bankId ? this.bank(recurrence.bankId) : undefined;
    return {
      ...recurrence,
      category: this.categorySelect(recurrence.categoryId),
      bank: bank
        ? bankFields === 'short'
          ? { id: bank.id, name: bank.name, color: bank.color }
          : { id: bank.id, name: bank.name, shortName: bank.shortName, color: bank.color, image: bank.image }
        : null,
    };
  }

  private listRecurrences(request: DemoRequest): DemoResponse {
    const { query } = request;
    const bankId = query.get('bankId');
    const categoryId = query.get('categoryId');
    const active = query.get('active');
    const recurrences = this.db.recurrences
      .filter((recurrence) => !bankId || recurrence.bankId === bankId)
      .filter((recurrence) => !categoryId || recurrence.categoryId === categoryId)
      .filter((recurrence) => active === null || recurrence.active === (active === 'true'))
      .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
    return json(recurrences.map((recurrence) => this.shapeRecurrence(recurrence, 'full')));
  }

  // ─── Tableau de bord ──────────────────────────────────────────────────────

  /**
   * Virements internes de la période, entre tous les comptes du profil — la
   * détection de `getInternalTransferIds`, qui apparie exactement comme
   * `buildTransferLinks` en parcourant les opérations de la plus récente à la
   * plus ancienne.
   */
  private internalTransferIds(from: Date, to: Date): Set<string> {
    const accessible = this.bankIdsIn(this.spaceIdsFor(this.db.sessionUserId));
    const candidates: TraceTxn[] = this.db.transactions
      .filter(
        (transaction) =>
          accessible.has(transaction.bankId) &&
          transaction.amount !== 0 &&
          transaction.date.getTime() >= from.getTime() &&
          transaction.date.getTime() <= to.getTime(),
      )
      .sort((a, b) => this.byDateDesc(a, b))
      .map(({ id, amount, date, description, bankId, categoryId, checked }) => ({
        id,
        amount,
        date,
        description,
        bankId,
        categoryId,
        checked,
      }));

    const ids = new Set<string>();
    for (const link of buildTransferLinks(candidates)) {
      ids.add(link.outId);
      ids.add(link.inId);
    }
    return ids;
  }

  /** `GET /api/dashboard/overview`, champ pour champ. */
  private overview(request: DemoRequest): DemoResponse {
    const { query } = request;
    const startDate = query.get('startDate');
    const endDate = query.get('endDate');
    const gte = startDate ? new Date(startDate) : null;
    const lte = endDate ? new Date(endDate) : null;

    const scope = this.scope(query);
    const scopeBankIds = this.bankIdsIn(scope);
    const inPeriod = (date: Date, from: Date | null, to: Date | null) =>
      (!from || date.getTime() >= from.getTime()) && (!to || date.getTime() <= to.getTime());

    const scoped = this.db.transactions.filter(
      (transaction) => scopeBankIds.has(transaction.bankId) && inPeriod(transaction.date, gte, lte),
    );

    const recentTransactions = [...scoped]
      .sort((a, b) => this.byDateDesc(a, b))
      .slice(0, 10)
      .map((transaction) => {
        const bank = this.bank(transaction.bankId);
        return {
          ...transaction,
          category: this.categorySelect(transaction.categoryId),
          bank: bank ? { id: bank.id, name: bank.name, color: bank.color } : null,
        };
      });

    // Période de référence : celle demandée, sinon le mois civil en cours —
    // en heure locale, comme le serveur dans son propre fuseau.
    const now = this.now();
    const periodStart = gte ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = lte ?? new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const transfers = this.internalTransferIds(periodStart, periodEnd);
    const withoutTransfers = scoped.filter((transaction) => !transfers.has(transaction.id));

    const totalIncome = withoutTransfers.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = Math.abs(withoutTransfers.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0));

    const sumByType = (accountType: BankRow['accountType'], sign: 1 | -1) =>
      this.db.transactions
        .filter((transaction) => {
          const bank = this.bank(transaction.bankId);
          return (
            bank?.accountType === accountType &&
            scopeBankIds.has(transaction.bankId) &&
            Math.sign(transaction.amount) === sign &&
            inPeriod(transaction.date, periodStart, periodEnd)
          );
        })
        .reduce((sum, transaction) => sum + transaction.amount, 0);

    const byCategory = new Map<string | null, number>();
    for (const transaction of withoutTransfers) {
      if (transaction.amount >= 0) continue;
      byCategory.set(transaction.categoryId, (byCategory.get(transaction.categoryId) ?? 0) + transaction.amount);
    }
    const expensesByCategory = [...byCategory.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([categoryId, sum]) => {
        const category = this.category(categoryId);
        return {
          categoryId,
          categoryName: category?.name || 'Non catégorisé',
          categoryColor: category?.color || '#6b7280',
          categoryIcon: category?.icon ?? undefined,
          amount: Math.abs(sum),
        };
      });

    const horizon = now.getTime() + 7 * DAY_MS;
    const upcomingRecurrences = this.db.recurrences
      .filter(
        (recurrence) =>
          recurrence.active &&
          recurrence.nextDue.getTime() <= horizon &&
          recurrence.bankId !== null &&
          scopeBankIds.has(recurrence.bankId),
      )
      .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime())
      .slice(0, 5)
      .map((recurrence) => this.shapeRecurrence(recurrence, 'short'));

    return json({
      summary: {
        totalIncome,
        totalExpenses,
        balance: totalIncome - totalExpenses,
        transactionCount: scoped.length,
        totalUsers: this.db.users.length,
        totalCategories: this.db.categories.length,
        currentMonthIncome: sumByType('CURRENT', 1) || 0,
        currentMonthExpense: Math.abs(sumByType('CURRENT', -1) || 0),
        savingsTotal: sumByType('SAVINGS', 1) || 0,
        investmentMonthTotal: Math.abs(sumByType('INVESTMENT', -1) || 0),
      },
      recentTransactions,
      expensesByCategory,
      upcomingRecurrences,
    });
  }

  /** `GET /api/dashboard/forecast` — la route, autour de `computeForecast` du serveur. */
  private forecast(request: DemoRequest): DemoResponse {
    const { query } = request;
    const scope = this.scope(query);
    const today = this.parseCivilDate(query.get('today'));

    const monthStart = new Date(Date.UTC(today.year, today.month - 1, 1));
    const monthEnd = new Date(Date.UTC(today.year, today.month, 1));
    const cutoff = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
    const burnStart = new Date(cutoff.getTime() - 90 * DAY_MS);

    const banks = this.db.banks.filter(
      (bank) =>
        scope.includes(bank.spaceId) &&
        !bank.archived &&
        (bank.spendable === true || (bank.spendable === null && bank.accountType === 'CURRENT')),
    );
    const bankIds = new Set(banks.map((bank) => bank.id));

    if (bankIds.size === 0) {
      return json({
        state: 'blocked',
        perDay: null,
        blockers: ['NO_SPENDABLE_ACCOUNT'],
        warnings: [],
        accounts: [],
        daysInMonth: new Date(Date.UTC(today.year, today.month, 0)).getUTCDate(),
      });
    }

    const accounts = banks.map((bank) => ({
      id: bank.id,
      name: bank.name,
      explicit: bank.spendable === true,
      balance: computeBalance(bank, this.flows(bank.id, cutoff)),
    }));
    const availableNow = accounts.reduce((sum, account) => sum + account.balance, 0);

    const activeRecurrences = this.db.recurrences.filter((recurrence) => recurrence.active);
    const recurrences: ForecastRecurrence[] = activeRecurrences
      .filter((recurrence) => recurrence.bankId !== null && bankIds.has(recurrence.bankId))
      .map((recurrence) => ({
        id: recurrence.id,
        amount: recurrence.amount,
        frequency: recurrence.frequency,
        nextDue: recurrence.nextDue,
        description: recurrence.description,
        bankId: recurrence.bankId,
        categoryId: recurrence.categoryId,
        categoryType: this.category(recurrence.categoryId)?.type ?? 'EXPENSE',
      }));
    const unscopedRecurrenceCount = activeRecurrences.filter((recurrence) => !recurrence.bankId).length;

    const spendable = this.db.transactions.filter((transaction) => bankIds.has(transaction.bankId));
    const toForecast = (transaction: TransactionRow): ForecastTransaction => ({
      id: transaction.id,
      bankId: transaction.bankId,
      categoryId: transaction.categoryId,
      amount: transaction.amount,
      date: transaction.date,
    });
    const monthTransactions = spendable
      .filter((t) => t.date.getTime() >= monthStart.getTime() && t.date.getTime() < monthEnd.getTime())
      .map(toForecast);
    const burnTransactions = spendable
      .filter((t) => t.date.getTime() >= burnStart.getTime() && t.date.getTime() < cutoff.getTime())
      .map(toForecast);

    const budgets = this.db.budgets
      .filter((budget) => budget.spaceId !== null && scope.includes(budget.spaceId) && budget.period === 'MONTHLY')
      .map(({ id, categoryId, bankId, amount }) => ({ id, categoryId, bankId, amount }));

    const firstTransaction = spendable.reduce<Date | null>(
      (earliest, t) => (!earliest || t.date.getTime() < earliest.getTime() ? t.date : earliest),
      null,
    );
    const lastTransaction = spendable
      .filter((t) => t.date.getTime() < cutoff.getTime())
      .reduce<Date | null>((latest, t) => (!latest || t.date.getTime() > latest.getTime() ? t.date : latest), null);
    const lastSync = banks
      .map((bank) => bank.ebLastSyncAt)
      .filter((date): date is Date => date instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const lastDataDate = [lastTransaction, lastSync]
      .filter((date): date is Date => date instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const result = computeForecast({
      today,
      availableNow,
      recurrences,
      monthTransactions,
      burnTransactions,
      budgets,
      firstTransactionDate: firstTransaction,
      lastDataDate,
      unscopedRecurrenceCount,
    });

    if (banks.some((bank) => bank.ebStatus === 'EXPIRED')) result.warnings.push('CONSENT_EXPIRED');

    const activeBankIds = new Set(burnTransactions.map((transaction) => transaction.bankId));
    const dormant = accounts.filter(
      (account) => !account.explicit && account.balance > 0.5 * availableNow && !activeBankIds.has(account.id),
    );
    const extra: Record<string, unknown> = {};
    if (availableNow > 0 && dormant.length > 0) {
      result.warnings.push('DORMANT_ACCOUNT');
      extra.dormantAccounts = dormant.map((account) => ({ id: account.id, name: account.name, balance: account.balance }));
    }

    return json({ ...result, ...extra, accounts });
  }

  /** `AAAA-MM-JJ` du client, sinon la date UTC « du serveur ». */
  private parseCivilDate(value: string | null): { year: number; month: number; day: number } {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
    if (match) {
      const parsed = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
      if (parsed.month >= 1 && parsed.month <= 12 && parsed.day >= 1 && parsed.day <= 31) return parsed;
    }
    const now = this.now();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() };
  }

  // ─── Objectifs ────────────────────────────────────────────────────────────

  private objective(id: string): ObjectiveRow | undefined {
    return this.db.objectives.find((objective) => objective.id === id);
  }

  private listObjectives(request: DemoRequest): DemoResponse {
    const scope = this.scope(request.query);
    const objectives = this.db.objectives
      .filter((objective) => objective.spaceId !== null && scope.includes(objective.spaceId))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((objective) => {
        const space = objective.spaceId ? this.space(objective.spaceId) : undefined;
        return { ...objective, space: space ? { id: space.id, name: space.name, kind: space.kind } : null };
      });
    return json(objectives);
  }

  private getObjective(id: string): DemoResponse {
    const objective = this.objective(id);
    return objective ? json({ ...objective }) : failure(404, 'Objective not found');
  }

  /**
   * Progression d'un objectif : les opérations positives dont le libellé
   * contient son titre, tous comptes confondus — la règle du serveur, que la
   * feuille d'actions explique (« Économie <titre> »).
   */
  private objectiveProgress(id: string): DemoResponse {
    const objective = this.objective(id);
    if (!objective) return failure(404, 'Objective not found');

    const transactions = this.db.transactions
      .filter((transaction) => likeContains(transaction.description, objective.title))
      .sort((a, b) => this.byDateDesc(a, b));
    const totalSaved = transactions.reduce((sum, transaction) => (transaction.amount > 0 ? sum + transaction.amount : sum), 0);
    const percentage = Math.min(100, (totalSaved / objective.targetAmount) * 100);

    return json({
      objective,
      transactions,
      totalSaved,
      remaining: Math.max(0, objective.targetAmount - totalSaved),
      percentage,
      isCompleted: percentage >= 100,
      searchPattern: `%${objective.title}%`,
      recentTransactions: transactions.slice(0, 3),
    });
  }

  private createObjective(request: DemoRequest): DemoResponse {
    const { title, description, targetAmount, deadline, spaceId, userId } = request.body;
    if (!title || !targetAmount) return failure(400, 'Title and target amount are required');

    const now = this.now();
    // L'émoji n'est pas une colonne : comme le serveur, la démo l'ignore et
    // l'écran le garde sur l'appareil.
    const objective: ObjectiveRow = {
      id: this.newId('objective'),
      title: String(title),
      description: text(description) || '',
      targetAmount: float(targetAmount),
      deadline: deadline ? new Date(String(deadline)) : null,
      isCompleted: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
      spaceId: text(spaceId) || (text(userId) ? this.resolveSpaceForUsers([String(userId)]) : null),
    };
    this.db.objectives.push(objective);
    return json({ ...objective }, 201);
  }

  private updateObjective(request: DemoRequest, id: string): DemoResponse {
    const { title, description, targetAmount, deadline, spaceId } = request.body;
    if (!title || !targetAmount) return failure(400, 'Title and target amount are required');

    const objective = this.objective(id);
    if (!objective) return failure(404, 'Objective not found');
    objective.title = String(title);
    objective.description = text(description) || '';
    objective.targetAmount = float(targetAmount);
    objective.deadline = deadline ? new Date(String(deadline)) : null;
    if (spaceId !== undefined) objective.spaceId = spaceId === null ? null : String(spaceId);
    objective.updatedAt = this.now();
    return json({ ...objective });
  }

  private archiveObjective(id: string): DemoResponse {
    const objective = this.objective(id);
    if (!objective) return failure(404, 'Objective not found');
    objective.archived = !objective.archived;
    objective.updatedAt = this.now();
    return json({ ...objective });
  }

  private deleteObjective(id: string): DemoResponse {
    if (!this.objective(id)) return failure(404, 'Objective not found');
    this.db.objectives = this.db.objectives.filter((objective) => objective.id !== id);
    return json({ message: 'Objective deleted successfully' });
  }

  // ─── Tricount ─────────────────────────────────────────────────────────────

  private listDebts(request: DemoRequest): DemoResponse {
    const userId = request.query.get('userId');
    if (!userId) return failure(400, 'userId is required');

    const me = this.user(this.db.sessionUserId);
    if (!me) return failure(400, 'NO_ME_USER', { message: 'Aucun utilisateur « Moi » défini.' });
    if (me.id === userId) {
      return failure(400, 'SAME_USER', { message: 'Impossible de créer un tricount avec soi-même.' });
    }
    const other = this.user(userId);
    if (!other) return failure(404, 'User not found');

    const debts = this.db.debts
      .filter(
        (debt) =>
          (debt.fromUserId === me.id && debt.toUserId === other.id) ||
          (debt.fromUserId === other.id && debt.toUserId === me.id),
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    // `findUnique` sans `select` : la ligne complète, comme le vrai serveur.
    return json({ me: { ...me }, other: { ...other }, debts, balance: netBalance(debts, me.id, other.id) });
  }

  /** Virements entre mes comptes et ceux de l'autre — même appariement que la route. */
  private detectTransfers(request: DemoRequest): DemoResponse {
    const userId = request.query.get('userId');
    if (!userId) return failure(400, 'userId is required');
    const me = this.user(this.db.sessionUserId);
    if (!me) return failure(400, 'NO_ME_USER', { message: 'Aucun utilisateur « Moi » défini.' });

    const mine = this.bankIdsForUser(me.id);
    const theirs = this.bankIdsForUser(userId);
    if (mine.size === 0 || theirs.size === 0) return json({ transfers: [] });

    const latest = (bankIds: Set<string>) =>
      this.db.transactions
        .filter((transaction) => bankIds.has(transaction.bankId))
        .sort((a, b) => this.byDateDesc(a, b))
        .slice(0, 1000);
    const myTx = latest(mine);
    const otherTx = latest(theirs);

    const key = (amount: number) => Math.round(Math.abs(amount) * 100);
    const otherByAmount = new Map<number, TransactionRow[]>();
    for (const transaction of otherTx) {
      const bucket = otherByAmount.get(key(transaction.amount));
      if (bucket) bucket.push(transaction);
      else otherByAmount.set(key(transaction.amount), [transaction]);
    }

    const used = new Set<string>();
    const transfers: Array<{
      id: string;
      date: Date;
      amount: number;
      direction: 'me_to_other' | 'other_to_me';
      myDescription: string;
      otherDescription: string;
    }> = [];

    for (const mt of myTx) {
      if (mt.amount === 0 || used.has(mt.id)) continue;
      const match = (otherByAmount.get(key(mt.amount)) ?? []).find(
        (ot) =>
          ot.id !== mt.id &&
          !used.has(ot.id) &&
          Math.sign(ot.amount) === -Math.sign(mt.amount) &&
          Math.abs(ot.date.getTime() - mt.date.getTime()) <= FIVE_DAYS &&
          (looksLikeTransfer(mt.description) || looksLikeTransfer(ot.description)),
      );
      if (!match) continue;
      used.add(mt.id);
      used.add(match.id);
      transfers.push({
        id: `${mt.id}_${match.id}`,
        date: mt.amount < 0 ? mt.date : match.date,
        amount: Math.abs(mt.amount),
        direction: mt.amount < 0 ? 'me_to_other' : 'other_to_me',
        myDescription: mt.description,
        otherDescription: match.description,
      });
    }

    transfers.sort((a, b) => b.date.getTime() - a.date.getTime());
    return json({ transfers });
  }

  private createDebt(request: DemoRequest): DemoResponse {
    const { fromUserId, toUserId, amount, description, date } = request.body;
    if (!fromUserId || !toUserId) return failure(400, 'fromUserId and toUserId are required');
    if (fromUserId === toUserId) return failure(400, 'fromUserId and toUserId must differ');
    const parsed = float(amount);
    if (Number.isNaN(parsed) || parsed <= 0) return failure(400, 'A positive amount is required');
    if (!description || !String(description).trim()) return failure(400, 'A description is required');
    if (!this.user(String(fromUserId)) || !this.user(String(toUserId))) return failure(404, 'User not found');

    const now = this.now();
    const debt: DebtRow = {
      id: this.newId('debt'),
      amount: parsed,
      description: String(description).trim(),
      date: date ? new Date(String(date)) : now,
      settled: false,
      createdAt: now,
      updatedAt: now,
      fromUserId: String(fromUserId),
      toUserId: String(toUserId),
    };
    this.db.debts.push(debt);
    return json(debt, 201);
  }

  private updateDebt(request: DemoRequest, id: string): DemoResponse {
    const { amount, description, date, settled } = request.body;
    const debt = this.db.debts.find((candidate) => candidate.id === id);

    if (amount !== undefined) {
      const parsed = float(amount);
      if (Number.isNaN(parsed) || parsed <= 0) return failure(400, 'A positive amount is required');
    }
    if (description !== undefined && !String(description).trim()) return failure(400, 'A description is required');
    if (!debt) return failure(404, 'Debt not found');

    if (amount !== undefined) debt.amount = float(amount);
    if (description !== undefined) debt.description = String(description).trim();
    if (date !== undefined) debt.date = new Date(String(date));
    if (settled !== undefined) debt.settled = Boolean(settled);
    debt.updatedAt = this.now();
    return json(debt);
  }

  private deleteDebt(id: string): DemoResponse {
    if (!this.db.debts.some((debt) => debt.id === id)) return failure(404, 'Debt not found');
    this.db.debts = this.db.debts.filter((debt) => debt.id !== id);
    return noContent();
  }
}

// ─── Branchement sur `fetch` ────────────────────────────────────────────────

let instance: DemoServer | null = null;

/**
 * Le serveur de la session.
 *
 * Créé à la première requête, il vit le temps du chargement de la page : les
 * modifications faites en démo durent jusqu'au prochain lancement, jamais au-delà.
 */
export function demoServer(): DemoServer {
  instance ??= new DemoServer(createDemoDatabase(new Date()));
  return instance;
}

/** Corps d'une requête `fetch`, lu comme Express le présenterait à la route. */
async function readBody(input: RequestInfo | URL, init?: RequestInit): Promise<{ body: Record<string, unknown>; files: string[] }> {
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
  const files: string[] = [];

  if (raw instanceof FormData) {
    const body: Record<string, unknown> = {};
    raw.forEach((value, key) => {
      if (typeof value === 'string') body[key] = value;
      else files.push(key);
    });
    return { body, files };
  }
  if (raw instanceof URLSearchParams) return { body: Object.fromEntries(raw.entries()), files };
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return { body: parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}, files };
    } catch {
      return { body: {}, files };
    }
  }
  return { body: {}, files };
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/**
 * `fetch` de la démo : même signature, même `Response`, aucune requête réseau.
 *
 * Un signal déjà interrompu fait échouer la promesse comme le ferait le vrai
 * `fetch` — l'écran Analyse s'en sert pour ignorer une période périmée.
 */
export async function demoFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (signal?.aborted) throw abortError();

  const url =
    typeof input === 'string'
      ? new URL(input, 'http://demo.invalid')
      : input instanceof URL
        ? input
        : new URL(input.url);
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const { body, files } = await readBody(input, init);

  const result = demoServer().handle({ method, path: url.pathname, query: url.searchParams, body, files });

  if (signal?.aborted) throw abortError();
  if (result.status === 204 || result.body === undefined) return new Response(null, { status: result.status });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
