import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAmount } from './amount';

test('la virgule du clavier français est acceptée', () => {
  assert.equal(parseAmount('12,50'), 12.5);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('0,01'), 0.01);
});

test('les séparateurs de milliers collés depuis un relevé sont retirés', () => {
  // L'espace insécable est ce que produit `Intl` : un montant recopié depuis
  // l'application elle-même doit se relire.
  assert.equal(parseAmount('1 234,56'), 1234.56);
  assert.equal(parseAmount('1 234,56'), 1234.56);
});

test('un montant négatif reste négatif', () => {
  assert.equal(parseAmount('-42'), -42);
});

test('une saisie incomplète ne vaut pas zéro', () => {
  // Renvoyer 0 enregistrerait une opération vide au moindre appui sur Entrée.
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('-'), null);
  assert.equal(parseAmount(','), null);
  assert.equal(parseAmount('.'), null);
  assert.equal(parseAmount('-,'), null);
});

test('un texte qui n’est pas un nombre est refusé', () => {
  assert.equal(parseAmount('douze'), null);
  assert.equal(parseAmount('12,50,3'), null);
});
