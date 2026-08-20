import assert from 'node:assert/strict';
import test from 'node:test';
import { describeNgrokFailure, ngrokErrorCode } from './ngrokErrors';

test('le code ngrok est retrouvé quel que soit son emplacement', () => {
  assert.equal(ngrokErrorCode({ errorCode: 'ERR_NGROK_108' }), 'ERR_NGROK_108');
  assert.equal(ngrokErrorCode({ message: 'failed to start tunnel: ERR_NGROK_105' }), 'ERR_NGROK_105');
  assert.equal(ngrokErrorCode(new Error('ERR_NGROK_334: domain not found')), 'ERR_NGROK_334');
  assert.equal(ngrokErrorCode(new Error('connexion refusée')), null);
  assert.equal(ngrokErrorCode(undefined), null);
});

test('une session déjà ouverte est nommée comme telle', () => {
  const message = describeNgrokFailure({ errorCode: 'ERR_NGROK_108', message: 'limited to 1 session' });
  assert.match(message, /déjà utilisé par une autre session/);
  assert.match(message, /ERR_NGROK_108/);
});

test('un token refusé n’est pas confondu avec un problème de domaine', () => {
  assert.match(describeNgrokFailure({ errorCode: 'ERR_NGROK_105' }), /token ngrok est refusé/);
  assert.match(describeNgrokFailure({ errorCode: 'ERR_NGROK_334' }), /n’est pas réservé/);
});

test('un code inconnu reste affiché, une erreur sans code garde son message', () => {
  assert.match(describeNgrokFailure({ errorCode: 'ERR_NGROK_999' }), /ERR_NGROK_999/);
  assert.match(describeNgrokFailure(new Error('réseau injoignable')), /réseau injoignable/);
  assert.match(describeNgrokFailure({}), /Vérifiez le token et le domaine/);
});
