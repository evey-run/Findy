import type { Transaction } from '../../types';
import { merchantName } from '../../lib/merchant';
import { formatShortDate } from '../../lib/format';
import Avatar from './Avatar';
import Amount from './Amount';
import { ListRow } from './ListRow';
import { text } from '../theme';

/**
 * Une opération, en une ligne.
 *
 * Le libellé brut d'une banque — « CARTE 09/08/25 MONOPRIX LYON 3 CB*0556 » —
 * remplit deux lignes sur un téléphone pour un seul mot utile. `merchantName`
 * en extrait le commerçant ; le libellé complet reste consultable dans la
 * feuille de détail, rien n'est perdu.
 *
 * La ligne secondaire porte la catégorie et le compte, ce qui suffit à lever
 * l'ambiguïté entre deux dépenses du même montant chez le même commerçant.
 */
export default function TransactionRow({
  transaction,
  onPress,
  /** Ajoute la date à la ligne secondaire, hors des listes groupées par jour. */
  showDate = false,
}: {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
  showDate?: boolean;
}) {
  const title = merchantName(transaction.description) || transaction.description;

  const meta = [
    showDate ? formatShortDate(transaction.date) : null,
    transaction.category?.name,
    transaction.bank?.shortName || transaction.bank?.name,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ListRow
      leading={
        <Avatar
          label={title}
          emoji={transaction.category?.icon}
          color={transaction.category?.color ?? transaction.bank?.color}
        />
      }
      title={title}
      subtitle={meta}
      trailing={<Amount value={transaction.amount} signed className={text.rowAmount} />}
      onClick={onPress ? () => onPress(transaction) : undefined}
    />
  );
}
