import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTrace, buildTransferLinks, type TraceStep, type TraceTxn } from './transferTrace';

function t(
  id: string,
  amount: number,
  date: string,
  bankId: string,
  description: string,
  categoryId: string | null = null,
): TraceTxn {
  return { id, amount, date: new Date(date), description, bankId, categoryId, checked: false };
}

const kinds = (steps: TraceStep[]) => steps.map((step) => step.kind);

// Chaîne complète : un salaire qui se disperse entre trois comptes.
//
//   Bourso (L)   +2000 salaire      1 mai
//   Bourso (L)   −1500 virement     2 mai   ─┐ lien
//   Livret (S)   +1500 virement     2 mai   ←┘
//   Livret (S)   −800 virement      10 mai  ─┐ lien
//   Ozan (C)     +800 virement      12 mai  ←┘
//   Ozan (C)     −45 courses        15 mai
const chain = [
  t('salary', 2000, '2026-05-01T08:00:00Z', 'L', 'Salaire', 'cat-prop'),
  t('leg1-out', -1500, '2026-05-02T09:00:00Z', 'L', 'Virement vers Livret'),
  t('leg1-in', 1500, '2026-05-02T10:00:00Z', 'S', 'Virement reçu'),
  t('leg2-out', -800, '2026-05-10T11:00:00Z', 'S', 'Virement vers Ozan'),
  t('leg2-in', 800, '2026-05-12T12:00:00Z', 'C', 'Virement reçu'),
  t('spent', -45, '2026-05-15T13:00:00Z', 'C', 'Monoprix'),
];

test('buildTransferLinks oriente le lien du compte émetteur vers le compte récepteur', () => {
  const links = buildTransferLinks(chain);
  assert.equal(links.length, 2);
  assert.deepEqual(
    links.map((link) => [link.outId, link.inId, link.outDate.getDate(), link.inDate.getDate()]),
    [
      ['leg1-out', 'leg1-in', 2, 2],
      ['leg2-out', 'leg2-in', 10, 12],
    ],
  );
  // L'ordre de découverte dépend de l'ordre d'entrée, mais l'orientation du
  // lien (émetteur → récepteur) doit être stable : le montant négatif part
  // toujours, le positif arrive toujours.
  const reversed = buildTransferLinks([...chain].reverse());
  assert.deepEqual(
    reversed.map((link) => link.outId).sort(),
    ['leg1-out', 'leg2-out'].sort(),
  );
  assert.deepEqual(
    reversed.map((link) => link.inId).sort(),
    ['leg1-in', 'leg2-in'].sort(),
  );
});

test('le trajet d’une sortie remonte la source puis suit l’argent', () => {
  const trace = buildTrace('leg1-out', chain, buildTransferLinks(chain));

  assert.equal(trace.focusId, 'leg1-out');
  assert.deepEqual(kinds(trace.steps), [
    'entry',
    'carry',
    'focus',
    'leg',
    'carry',
    'leg',
    'carry',
    'exit',
  ]);

  // L'argent vient du salaire, reste sur Bourso, puis se disperse.
  assert.deepEqual(trace.steps[0], { kind: 'entry', txnId: 'salary' });
  assert.deepEqual(trace.steps[1], { kind: 'carry', bankId: 'L' });
  assert.deepEqual(trace.steps[2], { kind: 'focus', txnId: 'leg1-out' });
  assert.deepEqual(trace.steps[3], { kind: 'leg', outId: 'leg1-out', inId: 'leg1-in' });

  assert.deepEqual(trace.sources, ['salary']);
  assert.deepEqual(trace.sinks, ['spent']);
  assert.equal(trace.accounted, true);
});

test('un virement entrant montre ce qu’il est devenu après l’arrivée', () => {
  const trace = buildTrace('leg1-in', chain, buildTransferLinks(chain));

  assert.deepEqual(kinds(trace.steps), ['entry', 'carry', 'leg', 'focus', 'carry', 'leg', 'carry', 'exit']);
  assert.deepEqual(trace.steps[2], { kind: 'leg', outId: 'leg1-out', inId: 'leg1-in' });
  assert.deepEqual(trace.steps[3], { kind: 'focus', txnId: 'leg1-in' });
  assert.deepEqual(trace.sources, ['salary']);
  assert.deepEqual(trace.sinks, ['spent']);
});

test('choisir le salaire lui-même décrit la suite de l’argent', () => {
  const trace = buildTrace('salary', chain, buildTransferLinks(chain));

  assert.deepEqual(kinds(trace.steps), ['focus', 'carry', 'leg', 'carry', 'leg', 'carry', 'exit']);
  assert.deepEqual(trace.sources, ['salary']);
  assert.equal(trace.accounted, true);
});

test('une dépense isolée s’explique par l’argent déjà présent sur le compte', () => {
  const isolated = [t('spent', -45, '2026-05-15T13:00:00Z', 'C', 'Monoprix')];
  const trace = buildTrace('spent', isolated, buildTransferLinks(isolated));

  assert.deepEqual(kinds(trace.steps), ['unexplained', 'focus']);
  assert.deepEqual(trace.steps[0], { kind: 'unexplained', bankId: 'C' });
  assert.deepEqual(trace.sources, []);
  assert.deepEqual(trace.sinks, []);
  assert.equal(trace.accounted, true);
});

test('un mouvement vers un compte sans suite se termine par « reste sur le compte »', () => {
  const partial = [
    t('salary', 2000, '2026-05-01T08:00:00Z', 'L', 'Salaire'),
    t('leg-out', -800, '2026-05-02T09:00:00Z', 'L', 'Virement vers Livret'),
    t('leg-in', 800, '2026-05-02T10:00:00Z', 'S', 'Virement reçu'),
  ];
  const trace = buildTrace('leg-out', partial, buildTransferLinks(partial));

  assert.deepEqual(kinds(trace.steps), ['entry', 'carry', 'focus', 'leg', 'remain']);
  assert.deepEqual(trace.steps[3], { kind: 'leg', outId: 'leg-out', inId: 'leg-in' });
  assert.deepEqual(trace.steps[4], { kind: 'remain', bankId: 'S' });
});

test('les virements ne s’apparient pas en dépit d’un montant identique si aucun libellé n’évoque un virement', () => {
  const shopping = [
    t('a', -45, '2026-05-02T09:00:00Z', 'L', 'Monoprix'),
    t('b', 45, '2026-05-02T10:00:00Z', 'S', 'Remboursement amis'),
  ];
  assert.equal(buildTransferLinks(shopping).length, 0);
  const trace = buildTrace('a', shopping, buildTransferLinks(shopping));
  // Sans lien, le trajet reste cantonné au compte de l'opération.
  assert.deepEqual(kinds(trace.steps), ['unexplained', 'focus']);
});

test('une source introuvable rend le trajet résolu quand même (argent antérieur)', () => {
  // Un virement sortant sans aucun apport antérieur dans le compte.
  const only = [t('leg-out', -1500, '2026-05-02T09:00:00Z', 'L', 'Virement vers Livret')];
  const trace = buildTrace('leg-out', only, buildTransferLinks(only));

  assert.deepEqual(kinds(trace.steps), ['unexplained', 'focus']);
  assert.equal(trace.accounted, true);
});