/**
 * Vocabulaire visuel de l'interface mobile.
 *
 * Les écrans desktop composent leurs classes Tailwind au cas par cas ; sur
 * mobile, la moindre variation de rayon ou de teinte se voit — tout est côte à
 * côte dans 390 points de large. Ce fichier fixe donc le peu de valeurs qui
 * doivent être identiques partout, et rien d'autre : ce n'est pas une
 * bibliothèque de composants, mais la palette dans laquelle ils puisent.
 *
 * Trois principes, tirés des références :
 *   • le fond est noir et les surfaces sont des voiles clairs très faibles
 *     (white/[0.04]) plutôt que des gris opaques — la profondeur vient de la
 *     lumière, pas d'un empilement de gris ;
 *   • les rayons sont larges et hiérarchisés : 28 px pour la carte héroïque,
 *     20 px pour les tuiles, 16 px pour les lignes, plein pour les pilules ;
 *   • une cible tactile ne descend jamais sous 44 points.
 */

/** Fond de l'application, repris par la barre de statut native. */
export const APP_BACKGROUND = '#09090b';

export const surfaces = {
  /** Tuile standard : liste, statistique, formulaire. */
  card: 'bg-white/[0.04] border border-white/[0.06]',
  /** Surface légèrement plus présente, pour un élément actif ou sélectionné. */
  cardRaised: 'bg-white/[0.07] border border-white/[0.09]',
  /** Fond des feuilles modales : plus opaque, il doit couvrir l'écran derrière. */
  sheet: 'bg-[#141419] border-t border-white/[0.08]',
  /** Barre d'onglets et barres flottantes. */
  floating: 'bg-zinc-900/80 backdrop-blur-2xl border border-white/[0.08]',
  /** Champ de saisie. */
  input: 'bg-white/[0.05] border border-white/[0.08] focus:border-violet-500/60 focus:bg-white/[0.07]',
} as const;

export const radii = {
  hero: 'rounded-[28px]',
  tile: 'rounded-3xl',
  row: 'rounded-2xl',
  control: 'rounded-xl',
  pill: 'rounded-full',
} as const;

export const text = {
  /** Montant héroïque : le seul chiffre lisible à bout de bras. */
  display: 'text-[34px] leading-none font-semibold tracking-tight text-white tabular-nums',
  /** Titre d'écran. */
  screenTitle: 'text-[22px] font-semibold tracking-tight text-zinc-50',
  /** Titre de section, au-dessus d'une liste. */
  section: 'text-[17px] font-semibold tracking-tight text-zinc-50',
  /** Libellé principal d'une ligne. */
  rowTitle: 'text-[15px] font-medium text-zinc-50',
  /** Sous-titre d'une ligne : catégorie, date, compte. */
  rowSubtitle: 'text-[13px] text-zinc-500',
  /** Montant d'une ligne. */
  rowAmount: 'text-[15px] font-semibold tabular-nums',
  /** Étiquette discrète au-dessus d'une valeur. */
  label: 'text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500',
  body: 'text-[15px] text-zinc-300 leading-relaxed',
  caption: 'text-[13px] text-zinc-500',
} as const;

/**
 * Champ de saisie.
 *
 * Défini ici plutôt que dans `components/Field.tsx` : un module de composants
 * ne doit exporter que des composants, faute de quoi le rechargement à chaud de
 * React abandonne le fichier entier à chaque édition.
 */
export const fieldControl =
  'h-12 w-full rounded-2xl px-4 text-[16px] text-zinc-50 placeholder-zinc-600 ' +
  'outline-none transition-colors ' +
  surfaces.input;

/** Hauteur minimale d'un élément tactile — 44 points, convention iOS. */
export const TAP_TARGET = 'min-h-[44px]';

/**
 * Marge latérale des écrans.
 *
 * 20 px : assez pour que le texte respire, assez peu pour qu'une liste
 * pleine largeur garde son amplitude sur un petit écran.
 */
export const GUTTER = 'px-5';

/** Couleurs de sens, communes à toute l'application. */
export const tones = {
  positive: 'text-emerald-400',
  negative: 'text-red-400',
  neutral: 'text-zinc-300',
  accent: 'text-violet-400',
} as const;

export type Tone = keyof typeof tones;

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
