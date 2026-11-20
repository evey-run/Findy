import type { ReactNode } from 'react';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import { cx, radii, surfaces, text } from '../theme';

/**
 * Ligne de liste tactile.
 *
 * Toute la ligne est la cible : viser une icône de 24 points avec un pouce est
 * un exercice d'adresse, et les écrans desktop de Findy cachent justement leurs
 * actions derrière des boutons qui n'apparaissent qu'au survol — un geste qui
 * n'existe pas ici. La hauteur minimale de 60 points laisse deux lignes de
 * texte respirer sans que la liste ne se dilue.
 */

interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Valeur alignée à droite — un montant, le plus souvent. */
  trailing?: ReactNode;
  /** Second niveau sous la valeur (date, pourcentage). */
  trailingSub?: ReactNode;
  onClick?: () => void;
  /** Chevron indiquant que la ligne mène ailleurs. */
  chevron?: boolean;
  className?: string;
}

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  onClick,
  chevron = false,
  className,
}: ListRowProps) {
  const content = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className={cx(text.rowTitle, 'truncate')}>{title}</div>
        {subtitle && <div className={cx(text.rowSubtitle, 'mt-0.5 truncate')}>{subtitle}</div>}
      </div>
      {(trailing || trailingSub) && (
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          {trailing}
          {trailingSub && <span className="text-[12px] text-zinc-500">{trailingSub}</span>}
        </div>
      )}
      {chevron && <ChevronRightIcon className="h-5 w-5 shrink-0 text-zinc-600" aria-hidden="true" />}
    </>
  );

  const shared = cx('flex w-full min-h-[60px] items-center gap-3 py-2.5 text-left', className);

  if (!onClick) return <div className={shared}>{content}</div>;

  return (
    <button type="button" onClick={onClick} className={cx(shared, 'tappable')}>
      {content}
    </button>
  );
}

/**
 * Carte regroupant des lignes.
 *
 * Les séparateurs s'arrêtent au rembourrage de la carte plutôt que d'aller
 * jusqu'au bord : la liste se lit comme un bloc et non comme un tableau.
 */
export function ListCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(radii.tile, surfaces.card, 'divide-y divide-white/[0.05] px-4', className)}
    >
      {children}
    </div>
  );
}
