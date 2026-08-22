/**
 * Surface d'une carte bancaire, dérivée de la couleur du compte.
 *
 * L'encre ne bascule jamais : le texte reste blanc, et c'est la surface qu'on
 * ramène dans une plage sombre. Un compte en jaune vif garde sa teinte, mais
 * assombrie jusqu'à ce que le blanc repasse largement au-dessus du seuil de
 * lisibilité — et une rangée de cartes ne se retrouve pas avec du texte noir
 * sur l'une et blanc sur l'autre.
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

/** Au-delà, le blanc ne tient plus le contraste sur la carte. */
const MAX_LUMINANCE = 0.13;

export interface CardSurface {
  background: string;
  /** Teinte d'origine, non assombrie : halo et liseré, pour garder l'éclat. */
  accent: string;
}

/**
 * Facteur d'assombrissement qui amène la couleur juste sous le seuil.
 *
 * On ne peut pas l'obtenir par une formule : la luminance sRGB n'est pas une
 * simple puissance des canaux, à cause de l'offset de la courbe de transfert.
 * Une recherche par dichotomie donne le facteur exact en quelques itérations —
 * la version approchée laissait le blanc à 0,153, au-dessus de la cible.
 */
function scaleToTarget(rgb: [number, number, number], target: number): number {
  if (relativeLuminance(rgb) <= target) return 1;

  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) / 2;
    const scaled = rgb.map((c) => c * mid) as [number, number, number];
    if (relativeLuminance(scaled) > target) high = mid;
    else low = mid;
  }
  return low;
}

export function cardSurface(hex?: string | null): CardSurface {
  const rgb = hexToRgb(hex);
  const k = scaleToTarget(rgb, MAX_LUMINANCE);
  const shade = (factor: number) =>
    `rgb(${rgb.map((c) => Math.round(c * k * factor)).join(', ')})`;

  return {
    background: `linear-gradient(118deg, ${shade(1)} 0%, ${shade(0.6)} 42%, #0b0b0f 100%)`,
    accent: `rgba(${rgb.join(', ')}, 0.45)`,
  };
}
