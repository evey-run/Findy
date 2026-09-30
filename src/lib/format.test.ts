import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDayLabel,
  formatMoney,
  formatMoneyCompact,
  formatMonthYear,
  formatSigned,
  monthRange,
  toISODate,
} from './format';

/** Intl insère une espace insécable étroite ; la normaliser rend les tests lisibles. */
function plain(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, ' ');
}

test('un montant est écrit à la française', () => {
  assert.equal(plain(formatMoney(1234.56)), '1 234,56 €');
  assert.equal(plain(formatMoney(0)), '0,00 €');
});

test('le montant signé utilise le vrai signe moins', () => {
  // U+2212 a la chasse d'un chiffre : une colonne de montants reste alignée,
  // ce que le tiret du clavier ne garantit pas.
  assert.equal(plain(formatSigned(-42)), '−42,00 €');
  assert.equal(plain(formatSigned(42)), '+42,00 €');
  assert.equal(plain(formatSigned(0)), '0,00 €');
});

test('la forme compacte ne s’applique qu’au-delà de mille', () => {
  assert.equal(plain(formatMoneyCompact(999)), '999,00 €');
  // « 12,3 k € » : la forme compacte de l'ICU en français sépare le symbole.
  assert.equal(plain(formatMoneyCompact(12_340)), '12,3 k €');
  assert.equal(plain(formatMoneyCompact(-12_340)), '-12,3 k €');
});

test('les jours proches sont nommés, les autres datés', () => {
  const reference = new Date(2026, 7, 28); // vendredi 28 août 2026

  assert.equal(formatDayLabel(new Date(2026, 7, 28), reference), "Aujourd'hui");
  assert.equal(formatDayLabel(new Date(2026, 7, 27), reference), 'Hier');
  // Entre deux et six jours, le nom du jour situe mieux qu'une date.
  assert.equal(formatDayLabel(new Date(2026, 7, 25), reference), 'Mardi');
  // Au-delà, la date chiffrée redevient plus informative.
  assert.equal(plain(formatDayLabel(new Date(2026, 7, 12), reference)), '12 août');
  // L'année n'apparaît que si elle diffère de l'année courante.
  assert.equal(plain(formatDayLabel(new Date(2025, 10, 3), reference)), '3 novembre 2025');
});

test('une date illisible ne produit pas de libellé', () => {
  assert.equal(formatDayLabel('pas-une-date'), '');
});

test('le mois est capitalisé', () => {
  assert.equal(formatMonthYear(new Date(2026, 7, 28)), 'Août 2026');
});

test('la date ISO reste en heure locale', () => {
  // `toISOString()` bascule en UTC : le 1er du mois à 00 h 30 y devient le
  // dernier jour du mois précédent, et la période affichée saute d'un mois.
  assert.equal(toISODate(new Date(2026, 0, 1, 0, 30)), '2026-01-01');
  assert.equal(toISODate(new Date(2026, 11, 31, 23, 45)), '2026-12-31');
});

test('la plage mensuelle couvre le mois entier', () => {
  assert.deepEqual(monthRange(new Date(2026, 1, 15)), {
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  });
  // Année bissextile : le 29 février doit être inclus.
  assert.deepEqual(monthRange(new Date(2024, 1, 15)), {
    startDate: '2024-02-01',
    endDate: '2024-02-29',
  });
});
