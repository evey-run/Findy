import test from 'node:test';
import assert from 'node:assert/strict';
import { toDateInputValue } from './dateFilter';

test('date seule conservée', () => {
  assert.equal(toDateInputValue('2025-03-15'), '2025-03-15');
});

test('ISO complet tronqué', () => {
  assert.equal(toDateInputValue('2025-03-15T23:59:59.999Z'), '2025-03-15');
});

test('vide ou invalide → chaîne vide', () => {
  assert.equal(toDateInputValue(''), '');
  assert.equal(toDateInputValue(null), '');
  assert.equal(toDateInputValue('abc'), '');
});
