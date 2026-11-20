import type { ReactNode } from 'react';
import { cx, radii, surfaces, text } from '../theme';

/**
 * États vides et squelettes de chargement.
 *
 * Sur mobile, un écran vide sans explication ressemble à une panne : la liste
 * occupe toute la surface visible, il n'y a pas de barre latérale ni de reste
 * d'interface pour rassurer. Chaque vide dit donc ce qui manque et propose
 * l'action qui le remplit.
 */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.05] text-2xl text-zinc-500">
          {icon}
        </div>
      )}
      <div>
        <p className="text-[16px] font-semibold text-zinc-200">{title}</p>
        {description && <p className={cx(text.caption, 'mt-1.5 max-w-[280px]')}>{description}</p>}
      </div>
      {action && <div className="mt-1 w-full max-w-[240px]">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-white/[0.06]', className)} />;
}

/** Silhouette d'une ligne de liste, aux dimensions exactes de `ListRow`. */
export function SkeletonRow() {
  return (
    <div className="flex min-h-[60px] items-center gap-3 py-2.5">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-3.5 w-16" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className={cx(radii.tile, surfaces.card, 'divide-y divide-white/[0.05] px-4')}>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </div>
  );
}

/** Carte de solde en cours de chargement — même encombrement que la vraie. */
export function SkeletonHero() {
  return <Skeleton className={cx(radii.hero, 'h-[188px] w-full')} />;
}

/** Bandeau d'erreur avec relance — l'API distante peut être injoignable. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className={cx(
        radii.tile,
        'border border-red-500/25 bg-red-500/10 px-4 py-3.5 text-[14px] text-red-200',
      )}
      role="alert"
    >
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="tappable mt-2 min-h-[40px] rounded-xl bg-red-500/20 px-4 text-[14px] font-medium text-red-100"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
