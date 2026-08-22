/**
 * Couleurs dominantes d'un logotype.
 *
 * La carte d'un compte tirait sa teinte d'une couleur choisie au hasard dans le
 * formulaire, la même pour tous les comptes. En lisant directement le logotype
 * officiel de la banque, chaque carte prend les couleurs de sa marque.
 *
 * Le décodage est fait à la main : le projet n'embarque aucune bibliothèque
 * d'images, et en ajouter une pour lire trois pixels serait disproportionné.
 * `zlib` fait partie de Node, le reste du format PNG tient en quelques dizaines
 * de lignes.
 */
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type Rgba = [number, number, number, number];

interface PngHeader {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
}

/** Nombre d'octets par pixel selon le type de couleur PNG. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Décode les pixels d'un PNG 8 bits non entrelacé.
 *
 * Renvoie un tableau vide — jamais d'exception — pour tout ce qui sort de ce
 * cadre : un logotype illisible doit faire retomber la carte sur sa couleur,
 * pas casser l'affichage du portefeuille.
 */
export function decodePng(buffer: Buffer): Rgba[] {
  try {
    if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return [];

    let header: PngHeader | null = null;
    let palette: Buffer | null = null;
    let paletteAlpha: Buffer | null = null;
    const dataChunks: Buffer[] = [];

    let offset = 8;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const start = offset + 8;
      const end = start + length;
      if (end > buffer.length) break;

      if (type === 'IHDR') {
        header = {
          width: buffer.readUInt32BE(start),
          height: buffer.readUInt32BE(start + 4),
          bitDepth: buffer[start + 8],
          colorType: buffer[start + 9],
          interlace: buffer[start + 12],
        };
      } else if (type === 'PLTE') palette = buffer.subarray(start, end);
      else if (type === 'tRNS') paletteAlpha = buffer.subarray(start, end);
      else if (type === 'IDAT') dataChunks.push(buffer.subarray(start, end));
      else if (type === 'IEND') break;

      offset = end + 4; // + CRC
    }

    if (!header || dataChunks.length === 0) return [];
    if (header.bitDepth !== 8 || header.interlace !== 0) return [];
    const channels = CHANNELS[header.colorType];
    if (!channels) return [];
    if (header.colorType === 3 && !palette) return [];

    const raw = zlib.inflateSync(Buffer.concat(dataChunks));
    return unfilter(raw, header, channels, palette, paletteAlpha);
  } catch {
    return [];
  }
}

/**
 * Défiltre les lignes et produit les pixels.
 *
 * Chaque ligne d'un PNG est précédée d'un octet de filtre : la valeur d'un
 * pixel dépend de son voisin de gauche et de la ligne précédente. Sans cette
 * étape, les octets bruts ne veulent rien dire.
 */
function unfilter(
  raw: Buffer,
  header: PngHeader,
  channels: number,
  palette: Buffer | null,
  paletteAlpha: Buffer | null,
): Rgba[] {
  const { width, height, colorType } = header;
  const stride = width * channels;
  const pixels: Rgba[] = [];
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    if (rowStart + stride + 1 > raw.length) break;

    const filter = raw[rowStart];
    const line = Buffer.from(raw.subarray(rowStart + 1, rowStart + 1 + stride));

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;

      switch (filter) {
        case 1: line[i] = (line[i] + left) & 0xff; break;
        case 2: line[i] = (line[i] + up) & 0xff; break;
        case 3: line[i] = (line[i] + ((left + up) >> 1)) & 0xff; break;
        case 4: line[i] = (line[i] + paeth(left, up, upLeft)) & 0xff; break;
        default: break; // 0 : aucun filtre
      }
    }

    for (let x = 0; x < width; x += 1) {
      const at = x * channels;
      if (colorType === 3) {
        const index = line[at];
        const p = index * 3;
        if (!palette || p + 2 >= palette.length) continue;
        const alpha = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255;
        pixels.push([palette[p], palette[p + 1], palette[p + 2], alpha]);
      } else if (colorType === 0) pixels.push([line[at], line[at], line[at], 255]);
      else if (colorType === 4) pixels.push([line[at], line[at], line[at], line[at + 1]]);
      else if (colorType === 2) pixels.push([line[at], line[at + 1], line[at + 2], 255]);
      else pixels.push([line[at], line[at + 1], line[at + 2], line[at + 3]]);
    }

    previous = line;
  }

  return pixels;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function saturation([r, g, b]: Rgba): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function toHex([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Couleurs dominantes d'un logotype, de la plus caractéristique à la moins.
 *
 * Un logotype est fait de larges aplats sur fond transparent. On écarte donc
 * le transparent, les gris et les extrêmes — un lettrage noir sur transparent
 * ne donnerait qu'un dégradé de noir — puis on regroupe les teintes proches et
 * on privilégie les couleurs saturées, qui sont celles de la marque.
 */
export function dominantColors(pixels: Rgba[], count = 3): string[] {
  const buckets = new Map<number, { total: Rgba; weight: number }>();

  for (const pixel of pixels) {
    const [r, g, b, a] = pixel;
    if (a < 160) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 238 && min > 238) continue; // blanc
    if (max < 32) continue; // noir
    if (saturation(pixel) < 0.18 && max - min < 24) continue; // gris

    // Regroupement grossier : deux bleus voisins doivent compter ensemble.
    const key = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    const bucket = buckets.get(key);
    // Une couleur saturée pèse davantage : c'est elle qui identifie la marque.
    const weight = 1 + saturation(pixel) * 2;
    if (bucket) {
      bucket.total[0] += r * weight;
      bucket.total[1] += g * weight;
      bucket.total[2] += b * weight;
      bucket.weight += weight;
    } else {
      buckets.set(key, { total: [r * weight, g * weight, b * weight, 255], weight });
    }
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.weight - a.weight)
    .map((bucket) => [
      bucket.total[0] / bucket.weight,
      bucket.total[1] / bucket.weight,
      bucket.total[2] / bucket.weight,
      255,
    ] as Rgba);

  // Deux teintes trop proches donneraient un dégradé plat.
  const kept: Rgba[] = [];
  for (const color of ranked) {
    if (kept.every((k) => distance(k, color) > 60)) kept.push(color);
    if (kept.length === count) break;
  }

  return kept.map(toHex);
}

function distance(a: Rgba, b: Rgba): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Raccourci : couleurs dominantes d'un fichier PNG en mémoire. */
export function logoPalette(buffer: Buffer, count = 3): string[] {
  return dominantColors(decodePng(buffer), count);
}

/**
 * Vrai si le logotype est clair, donc lisible tel quel sur un fond sombre.
 *
 * Les lettrages fournis par Enable Banking sont posés sur du transparent :
 * celui de Boursorama est bleu nuit, invisible sur une carte sombre. Il faut
 * alors le poser sur une plaque blanche, comme le font les vraies cartes. On ne
 * regarde que les pixels opaques, les seuls qui portent le dessin.
 */
export function isLightLogo(pixels: Rgba[]): boolean | null {
  let total = 0;
  let count = 0;

  for (const [r, g, b, a] of pixels) {
    if (a < 160) continue;
    total += relativeLuminance([r, g, b, 255]);
    count += 1;
  }

  if (count === 0) return null;
  // Seuil bas : dans le doute, la plaque blanche ne nuit à personne, alors
  // qu'un lettrage sombre sans plaque disparaît complètement.
  return total / count > 0.45;
}

/** Luminance relative WCAG, exposée pour `isLightLogo`. */
export function relativeLuminance([r, g, b]: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}
