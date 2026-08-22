import assert from 'node:assert/strict';
import test from 'node:test';
import { balanceHistory, sparklinePath, type HistoryTransaction } from './balanceHistory';

const now = new Date('2026-08-22T12:00:00.000Z');
const at = (iso: string, amount: number): HistoryTransaction => ({ date: new Date(`${iso}T00:00:00.000Z`), amount });

test('le dernier point est le solde d’aujourd’hui', () => {
  const { points } = balanceHistory(1000, [], 6, now);
  assert.equal(points[points.length - 1], 1000);
  assert.equal(points.length, 6);
});

test('on remonte le temps en retranchant les mouvements', () => {
  // 1 000 € aujourd'hui, après +300 en août et −100 en juillet.
  const { points } = balanceHistory(1000, [at('2026-08-10', 300), at('2026-07-15', -100)], 3, now);
  // Fin juin : 1000 − 300 − (−100) = 800. Fin juillet : 1000 − 300 = 700.
  assert.deepEqual(points, [800, 700, 1000]);
});

test('sans mouvement, la courbe est plate', () => {
  const { points, trend } = balanceHistory(500, [], 4, now);
  assert.deepEqual(points, [500, 500, 500, 500]);
  assert.equal(trend, 0);
});

test('une progression depuis zéro n’a pas de pourcentage', () => {
  // Le compte était vide : « +∞ % » n'aurait aucun sens.
  const { trend } = balanceHistory(1200, [at('2026-08-01', 1200)], 3, now);
  assert.equal(trend, null);
});

test('la variation est calculée sur la fenêtre', () => {
  const { trend } = balanceHistory(1200, [at('2026-08-01', 200)], 3, now);
  assert.equal(trend, 20, '1000 → 1200');
});

test('une courbe a besoin d’au moins deux points', () => {
  assert.equal(sparklinePath([42], 100, 30), '');
  assert.equal(sparklinePath([], 100, 30), '');
});

test('la courbe occupe toute la hauteur disponible', () => {
  const path = sparklinePath([0, 50, 100], 100, 30);
  assert.equal(path, 'M 0.0 30.0 L 50.0 15.0 L 100.0 0.0');
});

test('un solde constant trace une ligne médiane, pas une division par zéro', () => {
  const path = sparklinePath([7, 7, 7], 100, 30);
  assert.equal(path, 'M 0.0 15.0 L 50.0 15.0 L 100.0 15.0');
});
