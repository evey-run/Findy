import test from 'node:test';
import assert from 'node:assert/strict';
import { showHeaderGlass, headerCellBackground } from './headerGlass';

test('calque de verre affiché avec des lignes', () => {
  assert.equal(showHeaderGlass(3), true);
  assert.equal(headerCellBackground(3), '');
});

test('liste vide : pas de calque, les cellules ont leur propre fond', () => {
  assert.equal(showHeaderGlass(0), false);
  assert.notEqual(headerCellBackground(0), '');
});
