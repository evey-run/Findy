/**
 * Surface d'une carte bancaire.
 *
 * Les couleurs viennent du logotype officiel de la banque quand on a pu les en
 * extraire — Boursorama donne son magenta et son bleu nuit, le Crédit Mutuel
 * son bleu et son rouge. À défaut (un lettrage entièrement noir n'a aucune
 * couleur), on retombe sur la couleur du compte.
 *
 * Le rendu est volontairement discret : des halos larges et très adoucis en
 * fond sombre, plutôt qu'un aplat de couleur. L'encre ne bascule jamais — le
 * texte reste blanc, et c'est la surface qu'on maintient sombre.
 */

/** `#rgb` ou `#rrggbb` → composantes. Bleu de repli si la valeur est illisible. */
export function hexToRgb(hex?: string | null): [number, number, number] {
  const raw = (hex ?? '').trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [59, 130, 246]; // #3b82f6
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Luminance relative WCAG : 0 = noir, 1 = blanc. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Fond de la carte : assez sombre pour que le blanc tienne le contraste. */
const BASE = '#0e0e13';

/**
 * Grain, en SVG embarqué.
 *
 * Une texture de bruit empêche les dégradés larges de montrer les marches de
 * quantification sur un écran sombre, et donne de la matière à une surface qui
 * serait sinon parfaitement lisse.
 */
export const GRAIN_DATA_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

/** Position et étalement de chaque halo, du plus large au plus discret. */
const BLOBS = [
  { at: '14% 6%', size: '135% 120%', alpha: 0.38, stop: 58 },
  { at: '92% 22%', size: '110% 110%', alpha: 0.3, stop: 55 },
  { at: '68% 108%', size: '120% 115%', alpha: 0.24, stop: 60 },
];

export interface CardSurface {
  /** Empilement de halos sur fond sombre, prêt pour `backgroundImage`. */
  background: string;
  /** Vrai si les couleurs viennent bien du logotype de la banque. */
  fromLogo: boolean;
}

function rgba([r, g, b]: [number, number, number], alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Ramène une couleur dans une plage sombre en conservant sa teinte.
 *
 * La luminance sRGB n'est pas une puissance simple des canaux : on cherche le
 * facteur par dichotomie plutôt que par une formule approchée.
 */
function darkenTo(rgb: [number, number, number], target: number): [number, number, number] {
  if (relativeLuminance(rgb) <= target) return rgb;
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    const scaled = rgb.map((c) => c * mid) as [number, number, number];
    if (relativeLuminance(scaled) > target) high = mid;
    else low = mid;
  }
  return rgb.map((c) => Math.round(c * low)) as [number, number, number];
}

export function cardSurface(fallbackColor?: string | null, palette?: string[] | null): CardSurface {
  const fromLogo = Array.isArray(palette) && palette.length > 0;
  const source = fromLogo ? palette! : [fallbackColor ?? '#3b82f6'];

  // Les halos se superposant, chacun est plafonné bas : trois couches à pleine
  // intensité redonneraient un aplat clair et illisible.
  const colors = BLOBS.map((_, index) => darkenTo(hexToRgb(source[index % source.length]), 0.3));

  const layers = BLOBS.map(
    (blob, index) =>
      `radial-gradient(${blob.size} at ${blob.at}, ${rgba(colors[index], blob.alpha)} 0%, ` +
      `${rgba(colors[index], 0)} ${blob.stop}%)`,
  );

  return {
    background: [...layers, `linear-gradient(150deg, #16161d 0%, ${BASE} 100%)`].join(', '),
    fromLogo,
  };
}
