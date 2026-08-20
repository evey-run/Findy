import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicRequest, isPubliclyAllowedPath, shouldBlockRequest } from './publicSurface';

test('une requête locale de la webview n’est pas considérée comme publique', () => {
  assert.equal(isPublicRequest({ host: 'localhost:36321' }), false);
  assert.equal(isPublicRequest({ host: '127.0.0.1:36321' }), false);
  assert.equal(isPublicRequest({ host: '[::1]:36321' }), false);
});

test('une requête arrivée par le tunnel est publique', () => {
  assert.equal(isPublicRequest({ host: 'findy.ngrok-free.app' }), true);
  // Même avec un Host falsifié en localhost, les en-têtes proxy trahissent ngrok.
  assert.equal(isPublicRequest({ host: 'localhost:36321', 'x-forwarded-for': '1.2.3.4' }), true);
  assert.equal(isPublicRequest({ host: 'localhost:36321', 'ngrok-trace-id': 'abc' }), true);
  // Un Host absent ne doit jamais être traité comme local.
  assert.equal(isPublicRequest({}), true);
});

test('seules les routes du callback bancaire sont publiques', () => {
  assert.equal(isPubliclyAllowedPath('/api/enablebanking/callback'), true);
  assert.equal(isPubliclyAllowedPath('/api/enablebanking/select-account'), true);
  assert.equal(isPubliclyAllowedPath('/api/enablebanking/callback?code=x&state=y'), true);
  assert.equal(isPubliclyAllowedPath('/api/enablebanking/callback/'), true);

  assert.equal(isPubliclyAllowedPath('/api/transactions'), false);
  assert.equal(isPubliclyAllowedPath('/api/auth/profiles'), false);
  assert.equal(isPubliclyAllowedPath('/api/auth/login'), false);
  assert.equal(isPubliclyAllowedPath('/api/settings/backup'), false);
  assert.equal(isPubliclyAllowedPath('/uploads/avatar.png'), false);
  assert.equal(isPubliclyAllowedPath('/api/enablebanking/banks/abc/sync'), false);
});

test('le blocage combine origine et chemin', () => {
  const tunnel = { host: 'findy.ngrok-free.app' };
  const local = { host: 'localhost:36321' };

  assert.equal(shouldBlockRequest(tunnel, '/api/transactions'), true);
  assert.equal(shouldBlockRequest(tunnel, '/api/enablebanking/callback?code=x'), false);
  assert.equal(shouldBlockRequest(local, '/api/transactions'), false);
  assert.equal(shouldBlockRequest(local, '/api/enablebanking/callback'), false);
});
