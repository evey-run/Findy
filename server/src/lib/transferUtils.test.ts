import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeTransfer } from './transferUtils';

test('looksLikeTransfer reconnaît les libellés de virement classiques', () => {
  assert.equal(looksLikeTransfer('Virement vers Livret'), true);
  assert.equal(looksLikeTransfer('Virement reçu'), true);
  assert.equal(looksLikeTransfer('VIR SEPA BOURSOBANK'), true);
  assert.equal(looksLikeTransfer('Transfer incoming'), true);
  assert.equal(looksLikeTransfer('Transfert depuis compte'), true);
  assert.equal(looksLikeTransfer('Virement automatique'), true);
});

test('looksLikeTransfer reconnaît les libellés de places de marché', () => {
  // Leboncoin
  assert.equal(looksLikeTransfer('Solde Leboncoin Amandine'), true);
  assert.equal(looksLikeTransfer('SOLDE LEBONCOIN'), true);
  assert.equal(looksLikeTransfer('solde leboncoin paiement'), true);
});

test('looksLikeTransfer rejette les transactions externes (pas des virements internes)', () => {
  // Remboursements = transaction avec un tiers, pas un virement interne
  assert.equal(looksLikeTransfer('Remboursement amis'), false);
  assert.equal(looksLikeTransfer('REMBOURSEMENT'), false);
  assert.equal(looksLikeTransfer('remboursement CB'), false);
  
  // Paiements = transaction avec un tiers
  assert.equal(looksLikeTransfer('Paiement reçu'), false);
  assert.equal(looksLikeTransfer('PAIEMENT EFFECTUÉ'), false);
  assert.equal(looksLikeTransfer('paiement recu virement'), true); // Contient "virement"
  
  // Autres transactions non-virement
  assert.equal(looksLikeTransfer('Monoprix courses'), false);
  assert.equal(looksLikeTransfer('Netflix abonnement'), false);
  assert.equal(looksLikeTransfer('Amazon achat'), false);
  assert.equal(looksLikeTransfer('Carburant essence'), false);
  assert.equal(looksLikeTransfer(''), false);
  assert.equal(looksLikeTransfer('Paiement CB 12/01'), false);
});

test('looksLikeTransfer gère les cas limites', () => {
  // "vers" seul dans une chaîne
  assert.equal(looksLikeTransfer('Paiement vers Leboncoin'), true);
  // "vers" comme partie d'un mot
  assert.equal(looksLikeTransfer('Université'), false);
  // Description vide ou null
  assert.equal(looksLikeTransfer(''), false);
});
