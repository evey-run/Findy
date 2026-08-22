import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advance,
  computeForecast,
  dailyPath,
  daysInMonth,
  internalTransferIds,
  matchesOccurrence,
  occurrencesBetween,
  signedRecurrenceAmount,
  type ForecastBudget,
  type ForecastInput,
  type ForecastRecurrence,
  type ForecastTransaction,
} from './forecast';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// ─── Avancement des échéances ───────────────────────────────────────────────

test('une échéance mensuelle au 31 ne saute pas février', () => {
  // `setMonth(+1)` sur un 31 janvier donne le 3 mars : le mois de février
  // disparaît, et avec lui une mensualité entière.
  const jan31 = d('2026-01-31');
  const feb = advance(jan31, 'MONTHLY', 31);
  assert.equal(feb.toISOString().slice(0, 10), '2026-02-28');

  // Le jour d'ancrage est conservé : mars redevient un 31, pas un 28.
  const mar = advance(feb, 'MONTHLY', 31);
  assert.equal(mar.toISOString().slice(0, 10), '2026-03-31');
});

test('les cinq fréquences avancent comme attendu', () => {
  assert.equal(advance(d('2026-08-21'), 'DAILY').toISOString().slice(0, 10), '2026-08-22');
  assert.equal(advance(d('2026-08-21'), 'WEEKLY').toISOString().slice(0, 10), '2026-08-28');
  assert.equal(advance(d('2026-08-21'), 'MONTHLY').toISOString().slice(0, 10), '2026-09-21');
  assert.equal(advance(d('2026-08-21'), 'QUARTERLY').toISOString().slice(0, 10), '2026-11-21');
  assert.equal(advance(d('2026-08-21'), 'YEARLY').toISOString().slice(0, 10), '2027-08-21');
});

test('les années bissextiles sont respectées', () => {
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2026, 2), 28);
});

// ─── Occurrences ────────────────────────────────────────────────────────────

function recurrence(overrides: Partial<ForecastRecurrence> = {}): ForecastRecurrence {
  return {
    id: 'r1',
    amount: -700,
    frequency: 'MONTHLY',
    nextDue: d('2026-08-05'),
    description: 'Loyer',
    bankId: 'b1',
    categoryId: 'c-maison',
    categoryType: 'EXPENSE',
    ...overrides,
  };
}

test('une échéance très en retard est rattrapée sans écrire en base', () => {
  // `/recurrences/process` n'a aucun appelant : en base, nextDue traîne dans le
  // passé. Sans rattrapage, un loyer de mars ne serait jamais projeté.
  const rec = recurrence({ nextDue: d('2026-03-05') });
  const occ = occurrencesBetween(rec, d('2026-08-22'), d('2026-09-01'));
  assert.equal(occ.length, 0, 'le loyer du 5 tombe avant le 22 : rien à venir en août');

  const septembre = occurrencesBetween(rec, d('2026-09-01'), d('2026-10-01'));
  assert.deepEqual(septembre.map((o) => o.date.toISOString().slice(0, 10)), ['2026-09-05']);
});

test('une récurrence hebdomadaire produit plusieurs occurrences dans le mois', () => {
  const rec = recurrence({ frequency: 'WEEKLY', amount: -20, nextDue: d('2026-08-03') });
  const occ = occurrencesBetween(rec, d('2026-08-10'), d('2026-09-01'));
  assert.deepEqual(occ.map((o) => o.date.toISOString().slice(0, 10)), ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
});

test('une fréquence inconnue ne produit rien plutôt qu’une boucle infinie', () => {
  // Le switch de recurrences.ts n'a pas de branche par défaut : une fréquence
  // inconnue y laisse nextDue inchangée, donc une boucle sans fin ici.
  const occ = occurrencesBetween(recurrence({ frequency: 'FORTNIGHTLY' }), d('2026-08-01'), d('2026-09-01'));
  assert.deepEqual(occ, []);
});

test('le signe vient du type de catégorie, pas du montant saisi', () => {
  assert.equal(signedRecurrenceAmount(2800, 'INCOME'), 2800);
  assert.equal(signedRecurrenceAmount(-2800, 'INCOME'), 2800, 'un salaire saisi en négatif reste un revenu');
  assert.equal(signedRecurrenceAmount(15, 'EXPENSE'), -15, 'un abonnement saisi en positif reste une charge');
  assert.equal(signedRecurrenceAmount(15, 'FIXED'), -15);
});

// ─── Déduplication ──────────────────────────────────────────────────────────

test('une échéance déjà prélevée n’est pas comptée une seconde fois', () => {
  const occ = occurrencesBetween(recurrence({ nextDue: d('2026-08-25') }), d('2026-08-22'), d('2026-09-01'))[0];
  const preleve: ForecastTransaction = { id: 't1', bankId: 'b1', categoryId: 'c-maison', amount: -700, date: d('2026-08-26') };
  assert.equal(matchesOccurrence(occ, preleve), true);

  const autreCompte = { ...preleve, id: 't2', bankId: 'b2' };
  assert.equal(matchesOccurrence(occ, autreCompte), false);
  const tropLoin = { ...preleve, id: 't3', date: d('2026-08-30') };
  assert.equal(matchesOccurrence(occ, tropLoin), false);
  const montantDifferent = { ...preleve, id: 't4', amount: -500 };
  assert.equal(matchesOccurrence(occ, montantDifferent), false);
});

test('un virement entre ses propres comptes n’est pas une dépense', () => {
  const txs: ForecastTransaction[] = [
    { id: 'out', bankId: 'courant', categoryId: 'c-vir', amount: -3000, date: d('2026-08-10') },
    { id: 'in', bankId: 'livret', categoryId: 'c-vir', amount: 3000, date: d('2026-08-11') },
    { id: 'reel', bankId: 'courant', categoryId: 'c-vir', amount: -3000, date: d('2026-08-15') },
  ];
  const paired = internalTransferIds(txs);
  assert.equal(paired.has('out'), true);
  assert.equal(paired.has('in'), true);
  // Un virement de 3 000 € à un tiers, sans contrepartie, reste une dépense.
  assert.equal(paired.has('reel'), false);
});

// ─── Le taux journalier ─────────────────────────────────────────────────────

test('le taux tient compte du creux avant le salaire, pas seulement de la fin du mois', () => {
  // 1 200 € aujourd'hui, salaire de 1 900 € le 28. Diviser le solde de fin de
  // mois (3 085 €) par 10 jours autoriserait 308 €/jour et mettrait à découvert
  // le 27.
  const flows = new Map<number, number>([[25, -15], [28, 1900]]);
  const { perDayCash, endOfMonth, overdraftDay } = dailyPath(1200, flows, 22, 10);

  assert.equal(endOfMonth, 3085);
  assert.equal(overdraftDay, null);
  assert.equal(Math.floor(perDayCash), 197, '1185 € étalés sur les 6 jours jusqu’au salaire');
});

test('un découvert projeté est signalé au bon jour', () => {
  const flows = new Map<number, number>([[25, -1500]]);
  const { overdraftDay, perDayCash } = dailyPath(1000, flows, 22, 10);
  assert.equal(overdraftDay, 25);
  assert.ok(perDayCash < 0, 'le taux devient négatif : il n’y a rien à dépenser');
});

// ─── Le calcul complet ──────────────────────────────────────────────────────

function input(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    today: { year: 2026, month: 8, day: 22 },
    availableNow: 1200,
    recurrences: [],
    monthTransactions: [],
    burnTransactions: [],
    budgets: [],
    firstTransactionDate: d('2026-01-01'),
    lastDataDate: d('2026-08-21'),
    ...overrides,
  };
}

test('scénario complet : loyer déjà passé, Netflix et salaire à venir', () => {
  const result = computeForecast(
    input({
      recurrences: [
        recurrence({ id: 'loyer', nextDue: d('2026-03-05') }),
        recurrence({ id: 'netflix', amount: -15, nextDue: d('2026-08-25'), categoryId: 'c-abo', description: 'Netflix' }),
        recurrence({ id: 'salaire', amount: 1900, nextDue: d('2026-08-28'), categoryId: 'c-revenu', categoryType: 'INCOME', description: 'Salaire' }),
      ],
      monthTransactions: [
        { id: 'loyer-aout', bankId: 'b1', categoryId: 'c-maison', amount: -700, date: d('2026-08-04') },
        { id: 'courses', bankId: 'b1', categoryId: 'c-alim', amount: -260, date: d('2026-08-12') },
      ],
    }),
  );

  assert.equal(result.state, 'ok');
  assert.equal(result.daysLeft, 10);
  // Le loyer de mars roule au 5 septembre : hors du mois, jamais compté deux fois.
  assert.equal(result.projectedEndOfMonth, 3085);
  assert.equal(result.perDay, 197);
  assert.equal(result.limitedBy, 'cash');
  assert.deepEqual(result.upcoming.map((u) => u.description), ['Netflix', 'Salaire']);
});

test('un budget plafonne le chiffre sans jamais être soustrait du solde', () => {
  // Le couple réel du jeu de données : 105 € en banque, 1 100 € de budgets.
  // La formule « solde − budgets » donnerait −99 €/jour.
  const result = computeForecast(
    input({
      availableNow: 105.75,
      budgets: [
        { id: 'b-alim', categoryId: 'c-alim', bankId: null, amount: 700 },
        { id: 'b-loisir', categoryId: 'c-loisir', bankId: null, amount: 400 },
      ],
    }),
  );

  assert.ok(result.perDay !== null && result.perDay >= 0, 'jamais de reste à vivre négatif');
  assert.equal(result.perDay, 10, '105,75 € étalés sur 10 jours');
  assert.equal(result.limitedBy, 'cash', 'la trésorerie est plus contraignante que les budgets');
});

test('un budget plus serré que la trésorerie devient la limite', () => {
  const result = computeForecast(
    input({
      availableNow: 5000,
      monthTransactions: [{ id: 't', bankId: 'b1', categoryId: 'c-alim', amount: -350, date: d('2026-08-10') }],
      budgets: [{ id: 'b-alim', categoryId: 'c-alim', bankId: null, amount: 400 }],
    }),
  );

  assert.equal(result.budgetsLeft, 50);
  assert.equal(result.perDay, 5, '50 € restants sur 10 jours');
  assert.equal(result.limitedBy, 'budget');
});

test('un budget dépassé donne zéro, pas un nombre négatif', () => {
  const result = computeForecast(
    input({
      availableNow: 5000,
      monthTransactions: [{ id: 't', bankId: 'b1', categoryId: 'c-alim', amount: -450, date: d('2026-08-10') }],
      budgets: [{ id: 'b-alim', categoryId: 'c-alim', bankId: null, amount: 400 }],
    }),
  );

  assert.equal(result.budgetsLeft, 0);
  assert.equal(result.perDay, 0);
});

test('une échéance à venir consomme le budget de sa catégorie', () => {
  // Sans cette déduction, l'app autoriserait à dépenser une somme déjà engagée.
  const sansRecurrence = computeForecast(
    input({ availableNow: 5000, budgets: [{ id: 'b', categoryId: 'c-abo', bankId: null, amount: 100 }] }),
  );
  const avecRecurrence = computeForecast(
    input({
      availableNow: 5000,
      budgets: [{ id: 'b', categoryId: 'c-abo', bankId: null, amount: 100 }],
      recurrences: [recurrence({ id: 'netflix', amount: -60, nextDue: d('2026-08-25'), categoryId: 'c-abo' })],
    }),
  );

  assert.equal(sansRecurrence.budgetsLeft, 100);
  assert.equal(avecRecurrence.budgetsLeft, 40);
});

test('le dernier jour du mois ne divise pas par zéro', () => {
  const result = computeForecast(input({ today: { year: 2026, month: 8, day: 31 }, availableNow: 90 }));
  assert.equal(result.daysLeft, 1);
  assert.equal(result.state, 'last-day');
  assert.equal(result.perDay, 90);
});

test('un solde négatif est signalé comme tel', () => {
  const result = computeForecast(input({ availableNow: -320 }));
  assert.equal(result.state, 'overdrawn');
  assert.equal(result.perDay, 0, 'on ne propose pas de dépenser à découvert');
});

test('un découvert prévu avant la fin du mois change l’état', () => {
  const result = computeForecast(
    input({
      availableNow: 200,
      recurrences: [recurrence({ id: 'loyer', amount: -700, nextDue: d('2026-08-27') })],
    }),
  );
  assert.equal(result.state, 'projected-overdraft');
  assert.equal(result.overdraftDay, 27);
});

test('sans historique, aucun chiffre n’est avancé', () => {
  const result = computeForecast(input({ firstTransactionDate: null, lastDataDate: null }));
  assert.equal(result.state, 'blocked');
  assert.equal(result.perDay, null);
  assert.deepEqual(result.blockers, ['NO_TRANSACTIONS']);
});

test('des données trop vieilles bloquent le chiffre, un peu vieilles l’assortissent d’une réserve', () => {
  const perimees = computeForecast(input({ lastDataDate: d('2026-06-01') }));
  assert.equal(perimees.state, 'blocked');
  assert.ok(perimees.blockers.includes('STALE_DATA'));

  const vieillissantes = computeForecast(input({ lastDataDate: d('2026-08-10') }));
  assert.equal(vieillissantes.state, 'ok');
  assert.ok(vieillissantes.warnings.includes('AGING_DATA'));
});

test('des dépenses majoritairement non catégorisées invalident les budgets', () => {
  const result = computeForecast(
    input({
      availableNow: 5000,
      budgets: [{ id: 'b', categoryId: 'c-alim', bankId: null, amount: 400 }],
      monthTransactions: [
        { id: 't1', bankId: 'b1', categoryId: null, amount: -100, date: d('2026-08-05') },
        { id: 't2', bankId: 'b1', categoryId: null, amount: -100, date: d('2026-08-06') },
        { id: 't3', bankId: 'b1', categoryId: 'c-alim', amount: -100, date: d('2026-08-07') },
      ],
    }),
  );

  assert.ok(result.warnings.includes('LOW_CATEGORIZATION'));
  assert.equal(result.budgetsLeft, null, 'aucun plafond budgétaire n’est appliqué');
  assert.equal(result.limitedBy, 'cash');
});

test('une transaction saisie dans le futur n’est comptée qu’une fois', () => {
  const result = computeForecast(
    input({
      availableNow: 1000,
      monthTransactions: [{ id: 'futur', bankId: 'b1', categoryId: 'c-alim', amount: -200, date: d('2026-08-28') }],
    }),
  );
  assert.equal(result.projectedEndOfMonth, 800);
  assert.deepEqual(result.upcoming.map((u) => u.amount), [-200]);
});

test('le runway reste muet tant que l’historique est trop court', () => {
  const result = computeForecast(input({ firstTransactionDate: d('2026-08-10') }));
  assert.equal(result.runway.state, 'insufficient-data');
  assert.equal(result.runway.date, null);
});

test('le runway projette la date d’assèchement au rythme observé', () => {
  const burn: ForecastTransaction[] = Array.from({ length: 40 }, (_, i) => ({
    id: `t${i}`,
    bankId: 'b1',
    categoryId: 'c-alim',
    amount: -20,
    date: new Date(d('2026-08-21').getTime() - i * 24 * 60 * 60 * 1000),
  }));

  const result = computeForecast(input({ availableNow: 600, burnTransactions: burn }));
  assert.equal(result.runway.state, 'ok');
  // 40 dépenses de 20 € sur 90 jours observés ≈ 8,89 €/jour.
  assert.ok(result.runway.burnRate !== null && Math.abs(result.runway.burnRate - 8.89) < 0.05);
  assert.ok(result.runway.days !== null && result.runway.days > 60);
});

test('les charges récurrentes ne gonflent pas le rythme quotidien', () => {
  // Un loyer prélevé le 3 ne se dépense pas tous les jours : l'inclure dans la
  // moyenne ferait dire à l'app qu'on tient trois jours.
  const loyer: ForecastTransaction[] = [
    { id: 'loyer', bankId: 'b1', categoryId: 'c-maison', amount: -700, date: d('2026-08-03') },
  ];
  const courses: ForecastTransaction[] = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    bankId: 'b1',
    categoryId: 'c-alim',
    amount: -10,
    date: new Date(d('2026-08-20').getTime() - i * 24 * 60 * 60 * 1000),
  }));

  const result = computeForecast(
    input({
      availableNow: 2000,
      recurrences: [recurrence({ id: 'loyer', nextDue: d('2026-09-03') })],
      burnTransactions: [...loyer, ...courses],
    }),
  );

  assert.ok(result.runway.burnRate !== null && result.runway.burnRate < 3, 'le loyer est exclu de la moyenne');
});

test('les budgets en double sont sommés et signalés', () => {
  const budgets: ForecastBudget[] = [
    { id: 'b1', categoryId: 'c-alim', bankId: null, amount: 50 },
    { id: 'b2', categoryId: 'c-alim', bankId: null, amount: 50 },
  ];
  const result = computeForecast(input({ availableNow: 5000, budgets }));
  assert.equal(result.budgetsLeft, 100);
  assert.ok(result.warnings.includes('DUPLICATE_BUDGETS'));
});
