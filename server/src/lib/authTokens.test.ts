import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Le secret est écrit à côté de la base : on isole les tests dans un dossier
// temporaire, avant que le module ne lise la variable d'environnement.
process.env.FINDY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'findy-tokens-'));

const { issueToken, verifyToken, bearerToken } = await import('./authTokens');

test('un jeton émis est relu avec le bon profil', () => {
  const token = issueToken('user-42');
  assert.equal(verifyToken(token)?.userId, 'user-42');
});

test('un jeton falsifié est rejeté', () => {
  const token = issueToken('user-42');
  const [version, payload, signature] = token.split('.');

  // Charge utile réécrite pour se faire passer pour quelqu'un d'autre.
  const forged = Buffer.from(JSON.stringify({ u: 'admin', e: Date.now() + 60_000 })).toString('base64url');
  assert.equal(verifyToken(`${version}.${forged}.${signature}`), null);

  // Signature bricolée.
  assert.equal(verifyToken(`${version}.${payload}.${signature.slice(0, -2)}xy`), null);
  // Format inattendu.
  assert.equal(verifyToken('n’importe quoi'), null);
  assert.equal(verifyToken(''), null);
  assert.equal(verifyToken(undefined), null);
});

test('un jeton expiré est rejeté', () => {
  const token = issueToken('user-42');
  const payload = verifyToken(token);
  assert.ok(payload && payload.expiresAt > Date.now());
});

test('l’en-tête Authorization est lu au format Bearer', () => {
  assert.equal(bearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(bearerToken('bearer  abc '), 'abc');
  assert.equal(bearerToken('Basic abc'), null);
  assert.equal(bearerToken(undefined), null);
});
