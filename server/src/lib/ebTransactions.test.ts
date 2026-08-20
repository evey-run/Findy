import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consentWarning,
  hashTransactionFallback,
  normalizeTransaction,
  planReconciliation,
  type NormalizedTransaction,
} from './ebTransactions';

const bookedDebit = {
  entry_reference: 'tx-1',
  transaction_amount: { amount: '42.50', currency: 'EUR' },
  credit_debit_indicator: 'DBIT',
  booking_date: '2026-08-10',
  remittance_information: ['CARTE 09/08', 'MONOPRIX'],
  balance_after_transaction: { amount: '1200.10' },
};

test('le signe vient de l’indicateur PSD2, pas du montant', () => {
  const debit = normalizeTransaction(bookedDebit)!;
  assert.equal(debit.amount, -42.5);

  const credit = normalizeTransaction({ ...bookedDebit, credit_debit_indicator: 'CRDT' })!;
  assert.equal(credit.amount, 42.5);
});

test('une opération sans date de comptabilisation est PENDING', () => {
  const pending = normalizeTransaction({
    ...bookedDebit,
    booking_date: undefined,
    transaction_date: '2026-08-11',
  })!;
  assert.equal(pending.status, 'PENDING');
  assert.equal(normalizeTransaction(bookedDebit)!.status, 'BOOK');
});

test('le libellé retombe sur le créancier puis le débiteur', () => {
  assert.equal(normalizeTransaction(bookedDebit)!.description, 'CARTE 09/08 MONOPRIX');

  const fromCreditor = normalizeTransaction({ ...bookedDebit, remittance_information: [], creditor: { name: 'EDF' } })!;
  assert.equal(fromCreditor.description, 'EDF');

  const fromDebtor = normalizeTransaction({ ...bookedDebit, remittance_information: null, debtor: { name: 'Ozan' } })!;
  assert.equal(fromDebtor.description, 'Ozan');

  const nothing = normalizeTransaction({ ...bookedDebit, remittance_information: '   ' })!;
  assert.equal(nothing.description, 'Transaction');
});

test('sans identifiant bancaire, l’empreinte de repli est stable', () => {
  const raw = { ...bookedDebit, entry_reference: undefined, transaction_id: undefined };
  const first = normalizeTransaction(raw)!;
  const second = normalizeTransaction(raw)!;

  // C'est cette stabilité qui empêche de réimporter la même opération à chaque sync.
  assert.equal(first.externalId, second.externalId);
  assert.equal(
    first.externalId,
    hashTransactionFallback(first.date.toISOString(), first.amount, first.description),
  );

  // Un montant différent doit donner une empreinte différente.
  const other = normalizeTransaction({ ...raw, transaction_amount: { amount: '43.50', currency: 'EUR' } })!;
  assert.notEqual(first.externalId, other.externalId);
});

test('une charge utile inexploitable est ignorée plutôt qu’importée de travers', () => {
  assert.equal(normalizeTransaction(null), null);
  assert.equal(normalizeTransaction({ ...bookedDebit, transaction_amount: { amount: 'abc' } }), null);
  assert.equal(normalizeTransaction({ ...bookedDebit, booking_date: 'pas-une-date' }), null);
});

function tx(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    externalId: 'tx-1',
    amount: -10,
    date: new Date('2026-08-10'),
    description: 'Test',
    currency: 'EUR',
    balanceAfterTransaction: null,
    status: 'BOOK',
    ...overrides,
  };
}

test('une opération déjà connue n’est pas réimportée', () => {
  const plan = planReconciliation(
    [tx()],
    [{ id: 'db-1', externalId: 'tx-1', status: 'BOOK', balanceAfterTransaction: 100 }],
  );

  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.skipped, 1);
  assert.equal(plan.toUpdate.length, 0);
});

test('un doublon à l’intérieur du même lot n’est créé qu’une fois', () => {
  // Cas réel : deux pages de pagination qui se chevauchent.
  const plan = planReconciliation([tx(), tx(), tx({ externalId: 'tx-2' })], []);

  assert.deepEqual(plan.toCreate.map((t) => t.externalId), ['tx-1', 'tx-2']);
  assert.equal(plan.skipped, 1);
});

test('le passage PENDING → BOOK est réconcilié, pas dupliqué', () => {
  const plan = planReconciliation(
    [tx({ status: 'BOOK' })],
    [{ id: 'db-1', externalId: 'tx-1', status: 'PENDING', balanceAfterTransaction: null }],
  );

  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.pendingReconciled, 1);
  assert.deepEqual(plan.toUpdate, [{ id: 'db-1', status: 'BOOK' }]);
});

test('le solde après opération est complété quand il manquait', () => {
  const plan = planReconciliation(
    [tx({ balanceAfterTransaction: 990 })],
    [{ id: 'db-1', externalId: 'tx-1', status: 'BOOK', balanceAfterTransaction: null }],
  );

  assert.deepEqual(plan.toUpdate, [{ id: 'db-1', balanceAfterTransaction: 990 }]);

  // Déjà renseigné : on n'y touche pas.
  const untouched = planReconciliation(
    [tx({ balanceAfterTransaction: 990 })],
    [{ id: 'db-1', externalId: 'tx-1', status: 'BOOK', balanceAfterTransaction: 1000 }],
  );
  assert.equal(untouched.toUpdate.length, 0);
});

test('l’alerte de consentement ne se déclenche qu’à sept jours', () => {
  const now = new Date('2026-08-16T12:00:00Z');
  const bank = (days: number) => ({
    name: 'Boursobank',
    ebStatus: 'LINKED',
    ebExpiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
  });

  assert.equal(consentWarning(bank(30), now), null);
  assert.match(consentWarning(bank(5), now)!, /expire dans 5 jour/);
  assert.match(consentWarning(bank(-1), now)!, /a expiré/);
  assert.equal(consentWarning({ name: 'X', ebStatus: 'PENDING', ebExpiresAt: bank(1).ebExpiresAt }, now), null);
  assert.equal(consentWarning({ name: 'X', ebStatus: 'LINKED', ebExpiresAt: null }, now), null);
});
