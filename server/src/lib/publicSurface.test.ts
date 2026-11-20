import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPrivateNetworkHost,
  isPublicRequest,
  isPubliclyAllowedPath,
  shouldBlockRequest,
} from './publicSurface';

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

test('le réseau local n’est accepté que si l’accès mobile est activé', () => {
  const phone = { host: '192.168.1.20:36321' };

  // Sans l'option, une adresse privée reste « venue d'ailleurs ».
  assert.equal(isPublicRequest(phone), true);
  assert.equal(shouldBlockRequest(phone, '/api/transactions'), true);

  assert.equal(isPublicRequest(phone, { allowLan: true }), false);
  assert.equal(shouldBlockRequest(phone, '/api/transactions', { allowLan: true }), false);
});

test('l’exception réseau local ne couvre ni le tunnel ni une adresse publique', () => {
  // Un en-tête de proxy l'emporte sur tout, même avec un Host privé falsifié.
  assert.equal(
    isPublicRequest({ host: '192.168.1.20:36321', 'x-forwarded-for': '1.2.3.4' }, { allowLan: true }),
    true,
  );
  // Une adresse routable n'est pas un réseau local.
  assert.equal(isPublicRequest({ host: '51.75.12.4:36321' }, { allowLan: true }), true);
  assert.equal(isPublicRequest({ host: 'findy.ngrok-free.app' }, { allowLan: true }), true);
});

test('les plages privées reconnues sont celles de la RFC 1918', () => {
  assert.equal(isPrivateNetworkHost('10.0.0.4'), true);
  assert.equal(isPrivateNetworkHost('172.16.3.1'), true);
  assert.equal(isPrivateNetworkHost('172.31.255.255'), true);
  assert.equal(isPrivateNetworkHost('192.168.1.20:36321'), true);
  assert.equal(isPrivateNetworkHost('macbook-de-julie.local'), true);

  assert.equal(isPrivateNetworkHost('172.32.0.1'), false);
  assert.equal(isPrivateNetworkHost('11.0.0.1'), false);
  assert.equal(isPrivateNetworkHost('192.169.1.1'), false);
  assert.equal(isPrivateNetworkHost('999.1.1.1'), false);
  assert.equal(isPrivateNetworkHost(undefined), false);
});
