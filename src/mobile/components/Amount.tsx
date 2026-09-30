import { formatMoney, formatMoneyCompact, formatSigned } from '../../lib/format';
import { cx } from '../theme';

/**
 * Montant.
 *
 * Une colonne de montants ne se lit que si les chiffres sont alignés :
 * `tabular-nums` fixe leur chasse, et le signe moins typographique (« − »)
 * occupe la même largeur qu'un chiffre, contrairement au tiret du clavier.
 *
 * La couleur porte le sens — vert pour ce qui entre, rouge pour ce qui sort —
 * et le signe reste affiché : sur un relevé, « 42 € » et « −42 € » ne se
 * distinguent pas d'un coup d'œil par la seule teinte.
 */

interface AmountProps {
  value: number;
  /** Affiche « + » / « − » et colore selon le sens. */
  signed?: boolean;
  /** Abrège au-delà de mille (« 12,3 k€ ») — pour les tuiles étroites. */
  compact?: boolean;
  /** Force une teinte plutôt que de la déduire du signe. */
  tone?: 'positive' | 'negative' | 'neutral' | 'muted';
  className?: string;
}

const TONES = {
  positive: 'text-emerald-400',
  negative: 'text-red-400',
  neutral: 'text-zinc-100',
  muted: 'text-zinc-400',
} as const;

export default function Amount({ value, signed = false, compact = false, tone, className }: AmountProps) {
  const resolvedTone = tone ?? (signed ? (value >= 0 ? 'positive' : 'negative') : 'neutral');

  const label = compact
    ? formatMoneyCompact(value)
    : signed
      ? formatSigned(value)
      : formatMoney(value);

  return (
    <span className={cx('tabular-nums', TONES[resolvedTone], className)} data-selectable>
      {compact && signed && value > 0 ? `+${label}` : label}
    </span>
  );
}
