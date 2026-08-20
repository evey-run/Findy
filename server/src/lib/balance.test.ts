import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBalance, initialBalanceFor, movementsTotal } from './balance';

test('un compte courant suit simplement la somme des mouvements', () => {
  assert.equal(computeBalance({ balance: 1000, accountType: 'CHECKING' }, { assetFlow: 0, cashFlow: -250 }), 750);
  assert.equal(computeBalance({ balance: 0, accountType: 'SAVINGS' }, { assetFlow: 0, cashFlow: 320 }), 320);
});

test('un achat d’actif ne fait pas plonger un compte d’investissement', () => {
  // 2 000 € d'achats (enregistrés en négatif) restent 2 000 € de capital investi.
  assert.equal(movementsTotal('INVESTMENT', { assetFlow: -2000, cashFlow: 0 }), 2000);
  assert.equal(computeBalance({ balance: 0, accountType: 'INVESTMENT' }, { assetFlow: -2000, cashFlow: 0 }), 2000);
});

test('vendre plus qu’acheté ne crée pas de capital négatif', () => {
  // Le surplus est un gain réalisé, qui n'est plus sur le compte.
  assert.equal(movementsTotal('INVESTMENT', { assetFlow: 500, cashFlow: 0 }), 0);
});

test('les frais et intérêts d’un compte d’investissement comptent tels quels', () => {
  assert.equal(movementsTotal('INVESTMENT', { assetFlow: -1000, cashFlow: -30 }), 970);
});

test('initialBalanceFor est l’inverse exact de computeBalance', () => {
  const cases: Array<[string, { assetFlow: number; cashFlow: number }, number]> = [
    ['CHECKING', { assetFlow: 0, cashFlow: -412.35 }, 1500],
    ['SAVINGS', { assetFlow: 0, cashFlow: 90 }, 20_000],
    ['INVESTMENT', { assetFlow: -3200, cashFlow: 45 }, 5000],
    ['INVESTMENT', { assetFlow: 800, cashFlow: 0 }, 0],
  ];

  for (const [accountType, inputs, target] of cases) {
    // C'est ce qui cale un compte sur le solde réel renvoyé par la banque :
    // une erreur ici décale durablement l'affichage du solde.
    const initial = initialBalanceFor(accountType, target, inputs);
    assert.equal(computeBalance({ balance: initial, accountType }, inputs), target, accountType);
  }
});
