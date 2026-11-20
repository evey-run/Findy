import { assetUrl } from '../../lib/url';
import { cx } from '../theme';

/**
 * Pastille d'identité en tête de ligne.
 *
 * Sur un téléphone, c'est elle qui fait la lisibilité d'une liste : l'œil
 * accroche une forme colorée bien avant de lire un libellé. On prend, dans
 * l'ordre, ce qui identifie le mieux : le logotype de la banque, l'émoji de la
 * catégorie, sinon l'initiale du libellé sur un aplat teinté par la catégorie.
 */

interface AvatarProps {
  /** Libellé dont on tire l'initiale à défaut d'image ou d'émoji. */
  label: string;
  /** Émoji de catégorie. */
  emoji?: string | null;
  /** Chemin d'une image servie par le backend. */
  image?: string | null;
  /** Couleur d'accent (celle de la catégorie ou du compte). */
  color?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: 'h-9 w-9 text-[13px]',
  md: 'h-11 w-11 text-[15px]',
  lg: 'h-14 w-14 text-lg',
} as const;

const EMOJI_SIZES = {
  sm: 'text-[15px]',
  md: 'text-[18px]',
  lg: 'text-[22px]',
} as const;

/** Initiale affichable : première lettre alphanumérique du libellé. */
function initial(label: string): string {
  const match = label.match(/[\p{L}\p{N}]/u);
  return (match?.[0] ?? '?').toUpperCase();
}

export default function Avatar({
  label,
  emoji,
  image,
  color,
  size = 'md',
  className,
}: AvatarProps) {
  const base = cx(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-full',
    SIZES[size],
    className,
  );

  if (image) {
    return (
      <img
        src={assetUrl(image)}
        alt=""
        aria-hidden="true"
        className={cx(base, 'object-cover ring-1 ring-white/10')}
      />
    );
  }

  const accent = color || '#7c3aed';

  return (
    <div
      className={cx(base, 'font-semibold')}
      aria-hidden="true"
      style={{
        // Un aplat à 18 % garde la teinte reconnaissable sans jamais rivaliser
        // avec le montant, qui reste l'information principale de la ligne.
        backgroundColor: `${accent}2e`,
        color: accent,
      }}
    >
      {emoji ? <span className={EMOJI_SIZES[size]}>{emoji}</span> : initial(label)}
    </div>
  );
}
