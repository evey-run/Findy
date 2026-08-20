import assert from 'node:assert/strict';
import test from 'node:test';
import { isCurrentPublicCallbackOrigin } from './publicOrigin';

test('autorise uniquement l’origine HTTPS exacte du callback actif', () => {
  const callbackUrl = 'https://findy-test.ngrok-free.app';

  assert.equal(isCurrentPublicCallbackOrigin('https://findy-test.ngrok-free.app', callbackUrl), true);
  assert.equal(isCurrentPublicCallbackOrigin('https://other.ngrok-free.app', callbackUrl), false);
  assert.equal(isCurrentPublicCallbackOrigin('http://findy-test.ngrok-free.app', callbackUrl), false);
  assert.equal(isCurrentPublicCallbackOrigin('https://findy-test.ngrok-free.app', 'http://localhost:36321'), false);
  assert.equal(isCurrentPublicCallbackOrigin(undefined, callbackUrl), false);
});
