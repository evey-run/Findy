import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

/**
 * `PERSISTENCE_DIR` est figé à l'import du module : la variable doit être posée
 * avant, sinon le test écrirait dans le dossier `data/` du projet.
 */
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'findy-mobile-access-'));
process.env.FINDY_DATA_DIR = tempDir;

const { MOBILE_ACCESS_PATH, readMobileAccessPreference, writeMobileAccessPreference } = await import(
  './mobileAccess'
);

test('sans fichier, l’accès mobile est fermé', () => {
  assert.equal(readMobileAccessPreference(), false);
});

test('la préférence enregistrée est relue', () => {
  writeMobileAccessPreference(true);
  assert.equal(readMobileAccessPreference(), true);

  writeMobileAccessPreference(false);
  assert.equal(readMobileAccessPreference(), false);
});

test('un fichier illisible ferme l’accès plutôt que de l’ouvrir sur un doute', () => {
  fs.writeFileSync(MOBILE_ACCESS_PATH, '{ pas du json');
  assert.equal(readMobileAccessPreference(), false);
});

test('seul le booléen vrai ouvre l’accès', () => {
  // Une valeur inattendue — « true » en chaîne, 1, null — ne doit jamais
  // suffire à exposer le serveur au réseau.
  for (const value of ['true', 1, null, {}, []]) {
    fs.writeFileSync(MOBILE_ACCESS_PATH, JSON.stringify({ enabled: value }));
    assert.equal(readMobileAccessPreference(), false);
  }
});

test.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
