import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { brandLogoFilename, extensionForContentType, fetchBrandLogo } from './brandLogo';

function tempUploads(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'findy-brand-'));
}

function imageResponse(bytes: number, contentType = 'image/png'): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': contentType } });
}

test('le nom de fichier ne dépend jamais du nom de la banque', () => {
  // « Caixa Geral de Depósitos France » contient espaces et accents ; d'autres
  // noms d'ASPSP contiennent des barres obliques.
  const name = brandLogoFilename('FR', 'Caixa Geral de Depósitos France', '.png');
  assert.match(name, /^brand-[0-9a-f]{16}\.png$/);
  assert.equal(path.basename(name), name, 'aucun séparateur de chemin ne survit');
});

test('le nom est stable et distingue les établissements', () => {
  assert.equal(brandLogoFilename('FR', 'Revolut', '.png'), brandLogoFilename('fr', '  revolut  ', '.png'));
  assert.notEqual(brandLogoFilename('FR', 'Revolut', '.png'), brandLogoFilename('DE', 'Revolut', '.png'));
  assert.notEqual(brandLogoFilename('FR', 'Revolut', '.png'), brandLogoFilename('FR', 'N26', '.png'));
});

test('une extension fantaisiste retombe sur .png', () => {
  assert.match(brandLogoFilename('FR', 'Revolut', '../../evil'), /\.png$/);
});

test('seuls les types image donnent une extension', () => {
  assert.equal(extensionForContentType('image/png'), '.png');
  assert.equal(extensionForContentType('image/jpeg; charset=binary'), '.jpg');
  assert.equal(extensionForContentType('text/html'), null);
  assert.equal(extensionForContentType(null), null);
});

test('le logotype est téléchargé et rendu par un chemin public', async () => {
  const uploadsDir = tempUploads();
  const result = await fetchBrandLogo('Revolut', 'FR', {
    uploadsDir,
    listAspsps: async () => [{ name: 'Revolut', logo: 'https://example.test/revolut.png' }],
    fetchImpl: (async () => imageResponse(2048)) as unknown as typeof fetch,
  });

  assert.ok(result?.startsWith('/uploads/brand-'));
  assert.ok(fs.existsSync(path.join(uploadsDir, path.basename(result!))));
});

test('un établissement absent de la liste ne produit rien', async () => {
  const result = await fetchBrandLogo('Banque Inconnue', 'FR', {
    uploadsDir: tempUploads(),
    listAspsps: async () => [{ name: 'Revolut', logo: 'https://example.test/revolut.png' }],
    fetchImpl: (async () => imageResponse(2048)) as unknown as typeof fetch,
  });
  assert.equal(result, null);
});

test('une page HTML renvoyée en 200 n’est pas écrite dans uploads', async () => {
  const uploadsDir = tempUploads();
  const result = await fetchBrandLogo('Revolut', 'FR', {
    uploadsDir,
    listAspsps: async () => [{ name: 'Revolut', logo: 'https://example.test/oops' }],
    fetchImpl: (async () => imageResponse(500, 'text/html')) as unknown as typeof fetch,
  });

  assert.equal(result, null);
  assert.deepEqual(fs.readdirSync(uploadsDir), []);
});

test('un fichier démesuré est refusé', async () => {
  const uploadsDir = tempUploads();
  const result = await fetchBrandLogo('Revolut', 'FR', {
    uploadsDir,
    listAspsps: async () => [{ name: 'Revolut', logo: 'https://example.test/huge.png' }],
    fetchImpl: (async () => imageResponse(3 * 1024 * 1024)) as unknown as typeof fetch,
  });

  assert.equal(result, null);
  assert.deepEqual(fs.readdirSync(uploadsDir), []);
});

test('une panne réseau ne fait pas échouer la liaison bancaire', async () => {
  const result = await fetchBrandLogo('Revolut', 'FR', {
    uploadsDir: tempUploads(),
    listAspsps: async () => { throw new Error('réseau indisponible'); },
  });
  assert.equal(result, null);
});
