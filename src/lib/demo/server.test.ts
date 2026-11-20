import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoDatabase, DEMO_IDS } from './dataset';
import { DemoServer, demoFetch, type DemoResponse } from './server';
import { DEMO_UNAVAILABLE } from './mode';
import { merchantName } from '../merchant';

/**
 * Le mode démo remplace le serveur aux yeux de toute l'application : ces tests
 * vérifient qu'il en tient le rôle — mêmes formes, mêmes calculs, aucune
 * requête réseau — et que les données fictives racontent une histoire
 * cohérente quel que soit le jour où l'on ouvre la démo.
 */

/** Mi-octobre, en heure locale : le cas des captures d'écran. */
const REFERENCE = new Date(2026, 9, 14, 15, 30);

function serverAt(date: Date = REFERENCE): DemoServer {
  return new DemoServer(createDemoDatabase(date), () => date);
}

/** Appel au serveur, réponse repassée par JSON comme le ferait `fetch`. */
function call(server: DemoServer, method: string, target: string, body: Record<string, unknown> = {}, files: string[] = []) {
  const url = new URL(target, 'http://demo.invalid');
  const result: DemoResponse = server.handle({ method, path: url.pathname, query: url.searchParams, body, files });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed: any = result.body === undefined ? undefined : JSON.parse(JSON.stringify(result.body));
  return { status: result.status, body: parsed };
}

const PERSONAL = `spaceId=${DEMO_IDS.spaceCamille}`;
const FOYER = `spaceId=${DEMO_IDS.spaceFoyer}`;

// ─── Données ────────────────────────────────────────────────────────────────

test('la base de démo est identique d’un lancement à l’autre le même jour', () => {
  const first = createDemoDatabase(REFERENCE);
  const second = createDemoDatabase(new Date(2026, 9, 14, 8, 0));
  assert.deepEqual(JSON.stringify(first.transactions), JSON.stringify(second.transactions));
  assert.deepEqual(JSON.stringify(first.recurrences), JSON.stringify(second.recurrences));
});

test('l’historique couvre onze mois et s’arrête aujourd’hui', () => {
  const db = createDemoDatabase(REFERENCE);
  const today = Date.UTC(2026, 9, 14);
  const historyStart = Date.UTC(2025, 10, 1);

  assert.ok(db.transactions.length > 900, `${db.transactions.length} opérations`);
  for (const transaction of db.transactions) {
    assert.ok(transaction.date.getTime() <= today, `${transaction.description} est dans le futur`);
    // Minuit UTC, comme les dates que le serveur reçoit en AAAA-MM-JJ.
    assert.equal(transaction.date.getUTCHours(), 0);
  }

  // Seules les positions d'investissement constituées avant l'historique en sortent.
  const older = db.transactions.filter((transaction) => transaction.date.getTime() < historyStart);
  assert.ok(older.every((transaction) => transaction.quantity !== null));
  const months = new Set(
    db.transactions.filter((t) => t.date.getTime() >= historyStart).map((t) => t.date.toISOString().slice(0, 7)),
  );
  assert.equal(months.size, 12);
});

test('les libellés restent lisibles une fois nettoyés par l’écran', () => {
  const db = createDemoDatabase(REFERENCE);
  for (const description of new Set(db.transactions.map((transaction) => transaction.description))) {
    const name = merchantName(description);
    assert.match(name, /^[A-ZÀ-ÖØ-Þ0-9]/, `« ${description} » s’affiche « ${name} »`);
    assert.ok(name.length <= 40, `« ${name} » est trop long`);
  }
});

test('aucun nom de banque réelle : seulement des comptes génériques', () => {
  const db = createDemoDatabase(REFERENCE);
  assert.deepEqual(
    db.banks.map((bank) => bank.name).sort(),
    ['Banque en ligne', 'Banque principale', 'Compte courant', 'Compte joint', 'Livret A', 'PEA', 'Portefeuille crypto'],
  );
  assert.ok(db.banks.every((bank) => bank.brandLogo === null && bank.image === null));
});

// ─── Lecture ────────────────────────────────────────────────────────────────

test('la session ouvre directement le profil de Camille et ses deux espaces', () => {
  const server = serverAt();
  const session = call(server, 'GET', '/api/auth/session');
  assert.equal(session.status, 200);
  assert.equal(session.body.name, 'Camille');
  assert.equal(session.body.hasPassword, false);
  assert.equal('passwordHash' in session.body, false);

  const spaces = call(server, 'GET', '/api/spaces').body;
  assert.deepEqual(spaces.map((space: { name: string }) => space.name), ['Camille', 'Foyer']);
  assert.deepEqual(spaces[1].memberIds, [DEMO_IDS.camille, DEMO_IDS.leo]);
});

test('les comptes ont la forme et les soldes du vrai serveur', () => {
  const server = serverAt();
  const banks = call(server, 'GET', `/api/banks?${PERSONAL}&archived=false`).body;

  assert.deepEqual(
    banks.map((bank: { name: string }) => bank.name),
    ['Banque principale', 'Banque en ligne', 'Livret A', 'PEA', 'Portefeuille crypto'],
  );
  for (const bank of banks) {
    assert.ok(Number.isFinite(bank.balance) && bank.balance > 0, `${bank.name} : ${bank.balance}`);
    assert.equal(typeof bank.initialBalance, 'number');
    assert.equal(bank.points.length, 6);
    assert.ok(Array.isArray(bank.users) && bank.users[0].name === 'Camille');
    assert.equal(bank.spaceName, 'Camille');
  }

  // Un compte d'investissement vaut le capital investi : sa courbe monte.
  const pea = banks.find((bank: { name: string }) => bank.name === 'PEA');
  assert.ok(pea.trend > 0, `tendance du PEA : ${pea.trend}`);
});

test('les opérations se paginent sans trou ni doublon, et se cherchent sans casse', () => {
  const server = serverAt();
  const filters = `excludeAccountType=INVESTMENT&${PERSONAL}`;
  const all = call(server, 'GET', `/api/transactions?${filters}`).body;
  const pages = [0, 25, 50].flatMap(
    (offset) => call(server, 'GET', `/api/transactions?${filters}&limit=25&offset=${offset}`).body,
  );

  assert.deepEqual(pages.map((t: { id: string }) => t.id), all.slice(0, 75).map((t: { id: string }) => t.id));
  assert.ok(all.every((t: { bank: { accountType: string } }) => t.bank.accountType !== 'INVESTMENT'));
  assert.ok(all[0].bank.users.length > 0 && 'space' in all[0].bank);

  // Le `LIKE` de SQLite ignore la casse de l'ASCII seulement : « café des »
  // trouve « Café des Arts », « CAFÉ » ne le trouverait pas — comme en vrai.
  const found = call(server, 'GET', `/api/transactions?search=caf%C3%A9%20des&${PERSONAL}`).body;
  assert.ok(found.length > 0);
  assert.ok(found.every((t: { description: string }) => t.description.startsWith('Café des Arts')));
  assert.equal(call(server, 'GET', `/api/transactions?search=CAF%C3%89&${PERSONAL}`).body.length, 0);
});

test('le tableau de bord du mois en cours est complet', () => {
  const server = serverAt();
  const overview = call(server, 'GET', `/api/dashboard/overview?${PERSONAL}`).body;

  for (const [key, value] of Object.entries(overview.summary)) {
    assert.ok(Number.isFinite(value as number), `${key} = ${value}`);
  }
  assert.ok(overview.summary.currentMonthIncome > 2_000);
  assert.ok(overview.recentTransactions.length === 10);
  assert.ok(overview.expensesByCategory.length >= 5);
  assert.ok(overview.expensesByCategory.every((entry: { categoryName: string }) => entry.categoryName !== 'Non catégorisé'));
  // L'accueil montre toujours quelques échéances à venir.
  assert.ok(overview.upcomingRecurrences.length >= 2);
});

test('le reste à vivre se calcule, sans réserve ni blocage', () => {
  const server = serverAt();
  for (const scope of [PERSONAL, FOYER]) {
    const forecast = call(server, 'GET', `/api/dashboard/forecast?today=2026-10-14&${scope}`).body;
    assert.equal(forecast.state, 'ok', JSON.stringify(forecast.blockers));
    assert.ok(forecast.perDay > 0, `reste à vivre : ${forecast.perDay}`);
    assert.deepEqual(forecast.warnings, []);
    assert.ok(forecast.projectedEndOfMonth > 0);
  }
});

test('une seule enveloppe déborde, et légèrement — quel que soit le jour', () => {
  for (const day of [1, 3, 14, 28]) {
    const date = new Date(2026, 9, day, 12, 0);
    const server = serverAt(date);
    const budgets = call(server, 'GET', `/api/budgets?${PERSONAL}`).body;
    const transactions = call(server, 'GET', `/api/transactions?limit=5000&${PERSONAL}&startDate=2026-10-01`).body;

    const over = budgets.filter((budget: { categoryId: string; amount: number }) => {
      const spent = transactions
        .filter((t: { categoryId: string; amount: number }) => t.categoryId === budget.categoryId && t.amount < 0)
        .reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);
      return spent > budget.amount;
    });

    assert.equal(over.length, 1, `le ${day} : ${over.map((b: { category: { name: string } }) => b.category.name)}`);
    assert.equal(over[0].category.name, 'Vêtements');
  }
});

test('les objectifs avancent à des rythmes différents, dont un atteint', () => {
  const server = serverAt();
  const objectives = call(server, 'GET', `/api/objectives?${PERSONAL}`).body;
  const progress = objectives.map((objective: { id: string; title: string }) => ({
    title: objective.title,
    ...call(server, 'GET', `/api/objectives/${objective.id}/progress`).body,
  }));

  const byTitle = Object.fromEntries(progress.map((entry: { title: string; percentage: number }) => [entry.title, entry]));
  assert.equal(byTitle['Nouveau vélo'].isCompleted, true);
  assert.ok(byTitle['Voyage au Japon'].percentage > 50 && byTitle['Voyage au Japon'].percentage < 80);
  assert.ok(byTitle['Matelas de sécurité'].percentage > 40 && byTitle['Matelas de sécurité'].percentage < 70);
  assert.equal(call(server, 'GET', `/api/objectives?${FOYER}`).body[0].title, 'Mariage');
});

test('le tricount penche du côté de Camille et ne voit que les vrais virements', () => {
  const server = serverAt();
  const debts = call(server, 'GET', `/api/debts?userId=${DEMO_IDS.leo}`).body;
  assert.equal(debts.me.name, 'Camille');
  assert.equal(debts.other.name, 'Léo');
  assert.equal(debts.balance, 58.05);

  // Le compte joint appartient aux deux : ses participations ne doivent pas
  // passer pour des virements entre eux.
  const { transfers } = call(server, 'GET', `/api/debts/transfers?userId=${DEMO_IDS.leo}`).body;
  assert.deepEqual(
    transfers.map((transfer: { direction: string; amount: number }) => [transfer.direction, transfer.amount]),
    [['other_to_me', 120], ['me_to_other', 30]],
  );
});

test('le trajet d’une dépense remonte jusqu’au salaire, virement compris', () => {
  const server = serverAt();
  const online = call(server, 'GET', `/api/transactions?bankId=${DEMO_IDS.enLigne}&amountSign=negative&${PERSONAL}`).body;
  // La banque en ligne n'est alimentée que par virement depuis le compte
  // principal : toute dépense y a donc un trajet en deux comptes.
  const expense = online[0];
  const trace = call(server, 'GET', `/api/transactions/${expense.id}/trace`).body;

  assert.equal(trace.focusId, expense.id);
  assert.ok(trace.steps.some((step: { kind: string }) => step.kind === 'leg'), JSON.stringify(trace.steps));
  assert.ok(trace.banks.some((bank: { name: string }) => bank.name === 'Banque principale'));
  assert.equal(trace.accounted, true);
});

// ─── Écriture ───────────────────────────────────────────────────────────────

test('une opération ajoutée, modifiée puis supprimée se reflète partout', () => {
  const server = serverAt();
  const balance = () =>
    call(server, 'GET', `/api/banks?${PERSONAL}`).body.find((bank: { id: string }) => bank.id === DEMO_IDS.principale).balance;
  const before = balance();

  const created = call(server, 'POST', '/api/transactions', {
    amount: -42.5,
    description: 'Fleuriste Pivoine',
    date: '2026-10-14',
    bankId: DEMO_IDS.principale,
    categoryId: 'demo-cat-cadeaux',
  });
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(created.body.bank).sort(), ['color', 'id', 'image', 'name', 'shortName']);
  assert.equal(created.body.category.name, 'Cadeaux');
  assert.equal(round(balance()), round(before - 42.5));

  const updated = call(server, 'PUT', `/api/transactions/${created.body.id}`, { ...created.body, amount: -50, categoryId: null });
  assert.equal(updated.body.amount, -50);
  assert.equal(updated.body.category, null);

  assert.equal(call(server, 'DELETE', `/api/transactions/${created.body.id}`).status, 204);
  assert.equal(round(balance()), round(before));
});

test('catégories, budgets, objectifs et dépenses partagées se modifient en mémoire', () => {
  const server = serverAt();

  const category = call(server, 'POST', '/api/categories', { name: 'Jardin', type: 'EXPENSE', color: '#10b981', icon: '🌱' });
  assert.equal(category.status, 201);
  assert.deepEqual(category.body._count, { transactions: 0, budgets: 0, recurrences: 0 });
  const budget = call(server, 'POST', '/api/budgets', {
    amount: 80,
    period: 'MONTHLY',
    startDate: '2026-10-01',
    categoryId: category.body.id,
    spaceId: DEMO_IDS.spaceCamille,
  });
  assert.equal(budget.body.category.name, 'Jardin');
  assert.equal(call(server, 'DELETE', `/api/categories/${category.body.id}`).status, 204);
  assert.ok(!call(server, 'GET', `/api/budgets?${PERSONAL}`).body.some((b: { id: string }) => b.id === budget.body.id));

  const objective = call(server, 'POST', '/api/objectives', { title: 'Piano', targetAmount: 2000, spaceId: DEMO_IDS.spaceCamille });
  assert.equal(objective.status, 201);
  assert.equal(call(server, 'GET', `/api/objectives/${objective.body.id}/progress`).body.totalSaved, 0);
  assert.deepEqual(call(server, 'DELETE', `/api/objectives/${objective.body.id}`).body, { message: 'Objective deleted successfully' });

  const debt = call(server, 'POST', '/api/debts', {
    fromUserId: DEMO_IDS.leo,
    toUserId: DEMO_IDS.camille,
    amount: 10,
    description: 'Boulangerie',
    date: '2026-10-14',
  });
  assert.equal(debt.status, 201);
  assert.equal(call(server, 'GET', `/api/debts?userId=${DEMO_IDS.leo}`).body.balance, 68.05);
  call(server, 'PUT', `/api/debts/${debt.body.id}`, { settled: true });
  assert.equal(call(server, 'GET', `/api/debts?userId=${DEMO_IDS.leo}`).body.balance, 58.05);
});

test('un compte se crée depuis le formulaire multipart et se supprime avec ses opérations', async () => {
  const body = new FormData();
  body.append('data', JSON.stringify({ name: 'Compte voyage', balance: 300, accountType: 'CURRENT', userIds: [DEMO_IDS.camille] }));
  body.append('cardLast4', '1234 5678');
  const created = await demoFetch('/api/banks', { method: 'POST', body });
  assert.equal(created.status, 201);
  const bank = await created.json();
  assert.equal(bank.spaceId, DEMO_IDS.spaceCamille);
  assert.equal(bank.cardLast4, '5678');

  const removed = await demoFetch(`/api/banks/${bank.id}/permanent`, { method: 'DELETE' });
  assert.deepEqual(await removed.json(), { message: 'Bank permanently deleted', bankName: 'Compte voyage', deletedTransactions: 0 });
});

test('supprimer son profil retire ses dettes et ses espaces, pas les comptes', () => {
  const server = serverAt();
  const banksBefore = server.db.banks.length;
  assert.equal(call(server, 'DELETE', `/api/users/${DEMO_IDS.camille}`).status, 204);

  assert.equal(call(server, 'GET', '/api/auth/session').status, 401);
  assert.equal(server.db.debts.length, 0);
  assert.ok(server.db.members.every((member) => member.userId !== DEMO_IDS.camille));
  assert.equal(server.db.banks.length, banksBefore);
});

// ─── Refus et réseau ────────────────────────────────────────────────────────

test('ce qui n’a pas de sens en démo est refusé avec un message clair', () => {
  const server = serverAt();
  const refused = [
    call(server, 'PUT', '/api/auth/password', { userId: DEMO_IDS.camille, newPassword: 'secret' }),
    call(server, 'GET', '/api/settings/export'),
    call(server, 'POST', '/api/settings/import', {}),
    call(server, 'PUT', '/api/settings/ai', { enabled: true }),
    call(server, 'POST', '/api/settings/ai/categorize'),
    call(server, 'GET', '/api/enablebanking/configured'),
    call(server, 'POST', '/api/enablebanking/link', { bankId: DEMO_IDS.principale }),
    call(server, 'POST', `/api/enablebanking/banks/${DEMO_IDS.principale}/sync-manual`),
    call(server, 'PUT', `/api/users/${DEMO_IDS.camille}`, {}, ['avatar']),
    call(server, 'POST', '/api/banks', { data: '{}' }, ['image']),
  ];
  for (const response of refused) {
    assert.equal(response.status, 403);
    assert.equal(response.body.error, DEMO_UNAVAILABLE);
  }

  const unknown = call(server, 'GET', '/api/dashboard/monthly-trends');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error, DEMO_UNAVAILABLE);
  assert.equal(call(server, 'GET', '/uploads/avatars/x.png').status, 404);
});

test('la démo ne fait aucune requête réseau', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error('Requête réseau en mode démo'));
  try {
    for (const path of [
      '/api/auth/session',
      '/api/spaces',
      `/api/banks?${PERSONAL}`,
      `/api/transactions?limit=25&${PERSONAL}`,
      `/api/dashboard/overview?${PERSONAL}`,
      `/api/dashboard/forecast?today=2026-10-14&${PERSONAL}`,
      '/api/market/price?symbols=MNDE.PA,EMRG.PA',
    ]) {
      const response = await demoFetch(path);
      assert.equal(response.ok, true, path);
      await response.json();
    }
    assert.equal((await demoFetch('/api/debts/demo-debt-courses', { method: 'DELETE' })).status, 204);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('une requête interrompue échoue comme avec le vrai fetch', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(demoFetch('/api/spaces', { signal: controller.signal }), { name: 'AbortError' });
});

test('les mois limites ne cassent rien : fin d’année, 29 février, premier du mois', () => {
  for (const date of [new Date(2026, 11, 31, 22, 0), new Date(2027, 0, 1, 9, 0), new Date(2028, 1, 29, 12, 0), new Date(2026, 4, 1, 0, 30)]) {
    const server = serverAt(date);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const forecast = call(server, 'GET', `/api/dashboard/forecast?today=${iso}&${PERSONAL}`).body;
    assert.notEqual(forecast.state, 'blocked', `${iso} : ${forecast.blockers}`);
    const overview = call(server, 'GET', `/api/dashboard/overview?${PERSONAL}`).body;
    assert.ok(Number.isFinite(overview.summary.totalExpenses));
    const banks = call(server, 'GET', `/api/banks?${PERSONAL}`).body;
    assert.ok(banks.every((bank: { balance: number }) => bank.balance > 0), iso);
  }
});

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
