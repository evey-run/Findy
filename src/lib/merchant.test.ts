import assert from 'node:assert/strict';
import test from 'node:test';
import { merchantColor, merchantInitials, merchantName } from './merchant';

test('un paiement par carte se réduit au commerçant', () => {
  assert.equal(merchantName("CARTE 09/08/25 MCDONALD'S CB*0556"), "Mcdonald's");
  assert.equal(merchantName('CARTE 07/09/24 AUCHAN SUPERMAR 4 CB*0556'), 'Auchan Supermar');
});

test('un sigle garde ses capitales', () => {
  // « Sncf-Voyageurs » se lirait comme une faute.
  assert.equal(merchantName('CARTE 05/12/24 SNCF-VOYAGEURS CB*7677'), 'SNCF-Voyageurs');
});

test('la ville et le pays du terminal sont retirés', () => {
  // Format Boursorama : commerçant, ville entre barres obliques, pays.
  assert.equal(merchantName('MAXICOFFEE ARA\\NEYRON\\ FR'), 'Maxicoffee Ara');
  assert.equal(merchantName('CAFEOMATIC\\SAINT GENI\\ FR'), 'Cafeomatic');
});

test('une référence de terminal et un montant tronqué disparaissent', () => {
  assert.equal(merchantName('CARTE 19/08/26 AMAZON PRIME*OQ2V CB*0556 14,'), 'Amazon Prime');
});

test('un virement se réduit au nom de la personne', () => {
  assert.equal(merchantName('VIR SEPA MLLE KABITA DESCHANDOL Virement de'), 'Kabita Deschandol');
  assert.equal(merchantName('VIR DE M OZAN SAHIN'), 'Ozan Sahin');
  assert.equal(merchantName('Virement ELINE PATHIER'), 'Eline Pathier');
});

test('les opérations sans commerçant sont nommées pour ce qu’elles sont', () => {
  // « 69VILLEURBA » serait pire que « Retrait ».
  assert.equal(merchantName('RETRAIT DAB 02/02/25 69VILLEURBA CB*7677'), 'Retrait');
  assert.equal(merchantName('CHQ. N.4903928'), 'Chèque');
});

test('un libellé déjà lisible n’est pas recasé', () => {
  assert.equal(merchantName('Assurance Habitation Lemonade'), 'Assurance Habitation Lemonade');
  assert.equal(merchantName('www.hostinger.com'), 'www.hostinger.com');
});

test('le marqueur de récurrence disparaît, un libellé vide ne casse rien', () => {
  assert.equal(merchantName('Loyer appartement 🔄'), 'Loyer appartement');
  assert.equal(merchantName(''), 'Opération');
});

test('les initiales et la couleur d’un commerçant sont stables', () => {
  assert.equal(merchantInitials('Auchan Supermar'), 'AS');
  assert.equal(merchantInitials('Jow'), 'JO');
  assert.equal(merchantInitials(''), '?');
  assert.equal(merchantColor('Lidl'), merchantColor('Lidl'));
});
