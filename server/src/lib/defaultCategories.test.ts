import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CATEGORIES } from './defaultCategories';

const VALID_TYPES = new Set(['INCOME', 'EXPENSE', 'FIXED']);

test('le jeu par défaut contient les catégories de base attendues', () => {
  const names = DEFAULT_CATEGORIES.map((c) => c.name);
  // Les deux exemples cités par l'issue #36 doivent y figurer.
  assert.ok(names.includes('Alimentation'), 'Alimentation manquante');
  assert.ok(names.includes('Transport'), 'Transport manquant');
  assert.ok(DEFAULT_CATEGORIES.length >= 5, 'jeu par défaut trop pauvre');
});

test('chaque catégorie par défaut est bien formée', () => {
  for (const c of DEFAULT_CATEGORIES) {
    assert.ok(c.name.trim().length > 0, 'nom vide');
    assert.ok(VALID_TYPES.has(c.type), `type invalide: ${c.type}`);
    // La route categories.ts n'accepte que ces trois types (validation POST).
    assert.match(c.color, /^#[0-9a-f]{6}$/i, `couleur invalide: ${c.color}`);
    assert.ok(c.icon.length > 0, `icône manquante pour ${c.name}`);
  }
});

test('les trois familles (revenu, charge fixe, dépense) sont représentées', () => {
  const types = new Set(DEFAULT_CATEGORIES.map((c) => c.type));
  assert.ok(types.has('INCOME'), 'aucun revenu');
  assert.ok(types.has('FIXED'), 'aucune charge fixe');
  assert.ok(types.has('EXPENSE'), 'aucune dépense');
});

test('aucun doublon de nom dans le jeu par défaut', () => {
  const names = DEFAULT_CATEGORIES.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'noms en double');
});
