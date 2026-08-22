import assert from 'node:assert/strict';
import test from 'node:test';
import zlib from 'node:zlib';
import { decodePng, dominantColors, isLightLogo, logoPalette, type Rgba } from './logoColors';

/** Construit un PNG 8 bits RGBA non entrelacé, sans filtre, pour les tests. */
function makePng(width: number, height: number, pixelAt: (x: number, y: number) => Rgba): Buffer {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filtre « aucun »
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(x, y);
      const at = rowStart + 1 + x * 4;
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; raw[at + 3] = a;
    }
  }

  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) >>> 0 : 0);
    return Buffer.concat([length, body, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // profondeur
  ihdr[9] = 6;   // RGBA
  ihdr[12] = 0;  // non entrelacé

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('un PNG simple est décodé pixel par pixel', () => {
  const png = makePng(2, 2, (x, y) => (x === y ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  const pixels = decodePng(png);
  assert.equal(pixels.length, 4);
  assert.deepEqual(pixels[0], [255, 0, 0, 255]);
  assert.deepEqual(pixels[1], [0, 0, 255, 255]);
});

test('les données qui ne sont pas un PNG ne lèvent pas d’exception', () => {
  assert.deepEqual(decodePng(Buffer.from('ceci n’est pas une image')), []);
  assert.deepEqual(decodePng(Buffer.alloc(0)), []);
  // Signature correcte mais contenu tronqué.
  assert.deepEqual(decodePng(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])), []);
});

test('la couleur dominante d’un logotype est celle de la marque', () => {
  // Un lettrage bleu sur fond transparent, avec quelques pixels blancs.
  const png = makePng(10, 10, (x) => (x < 7 ? [0, 82, 204, 255] : x < 9 ? [255, 255, 255, 255] : [0, 0, 0, 0]));
  const palette = logoPalette(png);
  assert.equal(palette[0], '#0052cc');
});

test('le transparent, le blanc, le noir et les gris sont écartés', () => {
  const pixels: Rgba[] = [
    ...Array(50).fill([255, 255, 255, 255] as Rgba),   // blanc
    ...Array(50).fill([8, 8, 8, 255] as Rgba),          // noir
    ...Array(50).fill([128, 128, 128, 255] as Rgba),    // gris
    ...Array(50).fill([0, 82, 204, 12] as Rgba),        // presque transparent
    ...Array(10).fill([220, 38, 38, 255] as Rgba),      // la seule vraie couleur
  ];
  assert.deepEqual(dominantColors(pixels), ['#dc2626']);
});

test('deux teintes trop proches ne sont pas retenues deux fois', () => {
  const pixels: Rgba[] = [
    ...Array(40).fill([0, 82, 204, 255] as Rgba),
    ...Array(30).fill([4, 86, 208, 255] as Rgba), // quasi identique
    ...Array(20).fill([220, 38, 38, 255] as Rgba),
  ];
  const palette = dominantColors(pixels, 3);
  assert.equal(palette.length, 2, 'les deux bleus fusionnent');
  assert.equal(palette[1], '#dc2626');
});

test('un logotype entièrement noir ne renvoie aucune couleur', () => {
  // Le cas doit être détecté : la carte retombera sur la couleur du compte
  // plutôt que d'afficher un dégradé de noir sur noir.
  const png = makePng(6, 6, () => [10, 10, 10, 255]);
  assert.deepEqual(logoPalette(png), []);
});

test('une couleur saturée l’emporte sur une couleur terne plus fréquente', () => {
  const pixels: Rgba[] = [
    ...Array(60).fill([120, 110, 100, 255] as Rgba),  // beige terne, majoritaire
    ...Array(45).fill([255, 0, 128, 255] as Rgba),    // magenta franc
  ];
  assert.equal(dominantColors(pixels)[0], '#ff0080');
});

test('un lettrage sombre réclame une plaque claire', () => {
  const dark: Rgba[] = Array(100).fill([22, 33, 89, 255]);   // bleu nuit Boursorama
  const light: Rgba[] = Array(100).fill([245, 245, 245, 255]);
  const transparent: Rgba[] = Array(100).fill([0, 0, 0, 0]);

  assert.equal(isLightLogo(dark), false, 'du bleu nuit disparaîtrait sur la carte');
  assert.equal(isLightLogo(light), true);
  assert.equal(isLightLogo(transparent), null, 'aucun pixel opaque : on ne sait pas');
});

test('un logotype bicolore tranche sur la moyenne de ses pixels opaques', () => {
  const mixed: Rgba[] = [
    ...Array(80).fill([10, 10, 10, 255] as Rgba),
    ...Array(20).fill([255, 255, 255, 255] as Rgba),
  ];
  assert.equal(isLightLogo(mixed), false);
});
