import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRangeEnd } from './dateRange';

test('date seule → fin de journée UTC', () => {
  assert.equal(parseRangeEnd('2025-03-15')?.toISOString(), '2025-03-15T23:59:59.999Z');
});

test('ISO complet inchangé', () => {
  assert.equal(parseRangeEnd('2025-03-15T10:00:00.000Z')?.toISOString(), '2025-03-15T10:00:00.000Z');
});

test('vide ou invalide → undefined', () => {
  assert.equal(parseRangeEnd(''), undefined);
  assert.equal(parseRangeEnd(undefined), undefined);
  assert.equal(parseRangeEnd('pas-une-date'), undefined);
});
