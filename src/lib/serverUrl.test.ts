import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeServerUrl } from './serverUrl';

/**
 * L'adresse du serveur est la seule chose que l'utilisateur saisit à la main
 * sur son téléphone, au clavier virtuel. Elle doit donc tolérer ce qu'on tape
 * réellement — sans « http:// », avec une barre finale, parfois un chemin collé
 * depuis un message — et produire une origine exploitable ou rien du tout.
 */

test('le schéma est ajouté quand il manque', () => {
  assert.equal(normalizeServerUrl('192.168.1.20:36321'), 'http://192.168.1.20:36321');
  assert.equal(normalizeServerUrl('mon-mac.local:36321'), 'http://mon-mac.local:36321');
});

test('un schéma explicite est conservé', () => {
  assert.equal(normalizeServerUrl('https://findy.example.com'), 'https://findy.example.com');
  assert.equal(normalizeServerUrl('HTTPS://Findy.Example.com'), 'https://findy.example.com');
});

test('le chemin et la barre finale sont écartés', () => {
  // Concaténée telle quelle, une barre finale donnerait « …//api/health ».
  assert.equal(normalizeServerUrl('http://192.168.1.20:36321/'), 'http://192.168.1.20:36321');
  // Une adresse copiée depuis la barre du navigateur porte souvent un chemin.
  assert.equal(normalizeServerUrl('http://192.168.1.20:36321/api'), 'http://192.168.1.20:36321');
});

test('les espaces autour de la saisie sont ignorés', () => {
  assert.equal(normalizeServerUrl('  192.168.1.20:36321  '), 'http://192.168.1.20:36321');
});

test('une saisie inexploitable ne renvoie rien', () => {
  assert.equal(normalizeServerUrl(''), '');
  assert.equal(normalizeServerUrl('   '), '');
  assert.equal(normalizeServerUrl('http://'), '');
});
