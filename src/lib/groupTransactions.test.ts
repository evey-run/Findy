import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupDayRows, groupTransactions } from './groupTransactions';
import type { Transaction } from '../types';

function txn(overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'amount' | 'description'>): Transaction {
  return {
    date: '2026-06-10T12:00:00Z',
    checked: false,
    createdAt: '2026-06-10T12:00:00Z',
    updatedAt: '2026-06-10T12:00:00Z',
    bankId: 'b1',
    bank: { id: 'b1', name: 'Bank', color: '#111', balance: 0 },
    category: null,
    ...overrides,
  } as Transaction;
}

test('groupDayRows – une seule occurrence renvoie un single', () => {
  const txns = [txn({ id: 'a1', description: 'Café 42', amount: -4.5, bankId: 'b1' })];
  const rows = groupDayRows(txns);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'single');
  if (rows[0].kind === 'single') assert.equal(rows[0].transaction.id, 'a1');
});

test('groupDayRows – deux occurrences même description/jour forment un groupe', () => {
  const txns = [
    txn({ id: 'a1', description: 'Café 42', amount: -3.5, bankId: 'b1' }),
    txn({ id: 'a2', description: 'Café 42', amount: -4.5, bankId: 'b1' }),
  ];
  const rows = groupDayRows(txns);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'group');
  if (rows[0].kind === 'group') {
    assert.equal(rows[0].merchant, 'Café');
    assert.equal(rows[0].items.length, 2);
    assert.ok(Math.abs(rows[0].total - (-8.0)) < 0.01);
  }
});

test('groupDayRows – descriptions différentes même jour ne fusionnent pas', () => {
  const txns = [
    txn({ id: 'a1', description: 'Café 42', amount: -3.5, bankId: 'b1' }),
    txn({ id: 'a2', description: 'Amazon', amount: -19.99, bankId: 'b1' }),
  ];
  const rows = groupDayRows(txns);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.kind === 'single'));
});

test('groupTransactions – opérations de jours différents restent séparées', () => {
  const txns = [
    txn({ id: 'a1', description: 'Café', amount: -3, date: '2026-06-10T10:00:00Z' }),
    txn({ id: 'a2', description: 'Café', amount: -4, date: '2026-06-11T10:00:00Z' }),
  ];
  const rows = groupTransactions(txns);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.kind === 'single'));
});

test('groupTransactions – même description même jour forment un groupe', () => {
  const txns = [
    txn({ id: 'a1', description: 'Jow', amount: -8, date: '2026-06-10T08:00:00Z' }),
    txn({ id: 'a2', description: 'Jow', amount: -12, date: '2026-06-10T12:00:00Z' }),
    txn({ id: 'a3', description: 'Jow', amount: -5, date: '2026-06-10T18:00:00Z' }),
  ];
  const rows = groupTransactions(txns);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'group');
  if (rows[0].kind === 'group') {
    assert.equal(rows[0].items.length, 3);
    assert.ok(Math.abs(rows[0].total - (-25)) < 0.01);
  }
});

test('groupDayRows – le groupe garde l\'ordre du plus récent au plus ancien', () => {
  const txns = [
    txn({ id: 'a1', description: 'Café', amount: -3, date: '2026-06-10T08:00:00Z' }),
    txn({ id: 'a2', description: 'Café', amount: -4, date: '2026-06-10T18:00:00Z' }),
    txn({ id: 'a3', description: 'Café', amount: -2, date: '2026-06-10T12:00:00Z' }),
  ];
  const rows = groupDayRows(txns);
  assert.equal(rows.length, 1);
  if (rows[0].kind === 'group') {
    assert.equal(rows[0].items[0].id, 'a2');
    assert.equal(rows[0].items[1].id, 'a3');
    assert.equal(rows[0].items[2].id, 'a1');
  }
});