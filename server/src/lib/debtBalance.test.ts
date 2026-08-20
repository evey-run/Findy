import assert from 'node:assert/strict';
import test from 'node:test';
import { netBalance, type DebtEntry } from './debtBalance';

const ME = 'me';
const OTHER = 'other';

function debt(from: string, to: string, amount: number, settled = false): DebtEntry {
  return { fromUserId: from, toUserId: to, amount, settled };
}

test('le signe indique qui doit à qui', () => {
  // L'autre m'a emprunté 30 € → il me doit 30 €.
  assert.equal(netBalance([debt(OTHER, ME, 30)], ME, OTHER), 30);
  // J'ai emprunté 30 € → je lui dois 30 €.
  assert.equal(netBalance([debt(ME, OTHER, 30)], ME, OTHER), -30);
});

test('les dettes se compensent dans les deux sens', () => {
  const debts = [debt(OTHER, ME, 50), debt(ME, OTHER, 20), debt(OTHER, ME, 5)];
  assert.equal(netBalance(debts, ME, OTHER), 35);
});

test('une dette réglée ne compte plus', () => {
  const debts = [debt(OTHER, ME, 50, true), debt(OTHER, ME, 10)];
  assert.equal(netBalance(debts, ME, OTHER), 10);
});

test('une dette impliquant un tiers ne pollue pas le tricount', () => {
  const debts = [debt(OTHER, ME, 40), debt('tiers', ME, 1000), debt(ME, 'tiers', 500)];
  assert.equal(netBalance(debts, ME, OTHER), 40);
});

test('les centimes ne dérivent pas', () => {
  const debts = [debt(OTHER, ME, 0.1), debt(OTHER, ME, 0.2)];
  assert.equal(netBalance(debts, ME, OTHER), 0.3);
});

test('sans dette, le solde est nul', () => {
  assert.equal(netBalance([], ME, OTHER), 0);
});
