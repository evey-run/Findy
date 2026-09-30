import { useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import type { Transaction } from '../../types';
import { formatShortDate } from '../../lib/format';
import { cx, text } from '../theme';
import Avatar from './Avatar';
import Amount from './Amount';
import TransactionRow from './TransactionRow';

/**
 * Groupe de la même journée.
 *
 * Quand un même commerçant revient plusieurs fois le même jour, une seule
 * ligne le représente : le total est affiché, et un appui déplie le détail
 * opération par opération (chacune ouvre son trajet de l'argent).
 */

interface TransactionGroupRowProps {
  merchant: string;
  total: number;
  /** Triées de la plus récente à la plus ancienne. */
  items: Transaction[];
  onPressItem: (transaction: Transaction) => void;
  /** Ajoute la date à la ligne secondaire, hors des listes groupées par jour. */
  showDate?: boolean;
}

export default function TransactionGroupRow({ merchant, total, items, onPressItem, showDate = false }: TransactionGroupRowProps) {
  const [expanded, setExpanded] = useState(false);
  const mostRecent = items[0];

  // Catégorie du groupe : même catégorie sur toutes les lignes → on l'affiche,
  // sinon « Multiple ».
  const categoryIds = new Set(items.map((t) => t.categoryId).filter(Boolean));
  const groupLabel = items.length === 1
    ? (mostRecent.category?.name ?? 'Sans catégorie')
    : categoryIds.size === 1
      ? (mostRecent.category?.name ?? `${items.length} opérations`)
      : 'Multiple';

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className={cx('flex w-full min-h-[60px] items-center gap-3 py-2.5 text-left', 'tappable')}
      >
        <Avatar
          label={merchant}
          emoji={mostRecent.category?.icon}
          color={mostRecent.category?.color ?? mostRecent.bank?.color}
        />
        <div className="min-w-0 flex-1">
          <div className={cx(text.rowTitle, 'truncate')}>{merchant}</div>
          <div className={cx(text.rowSubtitle, 'mt-0.5 truncate')}>
            {groupLabel}{showDate && items.length === 1 ? ` · ${formatShortDate(mostRecent.date)}` : ''}
          </div>
        </div>
        <Amount value={total} signed className={text.rowAmount} />
        <ChevronDownIcon
          className={cx(
            'h-5 w-5 shrink-0 text-zinc-600 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="ml-12 divide-y divide-white/[0.05] border-l-2 border-white/[0.08] pb-1 pl-4">
          {items.map((transaction) => (
            <div key={transaction.id} className="min-w-0">
              <TransactionRow transaction={transaction} showDate={false} onPress={onPressItem} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}