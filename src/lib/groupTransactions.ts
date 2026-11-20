import type { Transaction } from '../types';
import { merchantName } from './merchant';

/**
 * Regroupement des lignes d'une même journée.
 *
 * Un relevé bancaire aligne parfois une demi-douzaine de « Café » le même
 * jour : autant de lignes pour un seul marchand. « Boulangerie 42 × 3 » dit la
 * même chose en une ligne — le total, et le détail derrière un appui.
 *
 * Le client reçoit soit l'opération seule (`single`), soit le groupe
 * (`group`) qui les totalise. Le groupe garde ses opérations triées de la
 * plus récente à la plus ancienne, comme la liste.
 */

export type TransactionListRow =
  | { kind: 'single'; key: string; transaction: Transaction }
  | { kind: 'group'; key: string; merchant: string; total: number; items: Transaction[] };

export function groupDayRows(transactions: Transaction[]): TransactionListRow[] {
  const byMerchant = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const merchant = merchantName(transaction.description) || transaction.description;
    const list = byMerchant.get(merchant);
    if (list) list.push(transaction);
    else byMerchant.set(merchant, [transaction]);
  }

  const rows: TransactionListRow[] = [];
  for (const [merchant, items] of byMerchant) {
    if (items.length === 1) {
      rows.push({ kind: 'single', key: `tx:${items[0].id}`, transaction: items[0] });
    } else {
      rows.push({
        kind: 'group',
        key: `group:${merchant}`,
        merchant,
        total: items.reduce((sum, transaction) => sum + transaction.amount, 0),
        items: [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      });
    }
  }

  // Les groupes repartent à la position de leur opération la plus récente,
  // pour retrouver l'ordre chronologique de la journée.
  rows.sort((a, b) => latestDate(b) - latestDate(a));
  return rows;
}

/**
 * Regroupement d'une liste multi-jours (l'accueil, sans sections).
 *
 * Le regroupement reste limité à une même journée : un « Café » lundi et le
 * « Café » de mercredi ne font pas un seul article. Chaque journée est traitée
 * indépendamment, puis les lignes sont réassemblées de la plus récente à la
 * plus ancienne.
 */
export function groupTransactions(transactions: Transaction[]): TransactionListRow[] {
  const byDay = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const key = localISODate(new Date(transaction.date));
    const list = byDay.get(key);
    if (list) list.push(transaction);
    else byDay.set(key, [transaction]);
  }

  const rows: TransactionListRow[] = [];
  for (const items of byDay.values()) rows.push(...groupDayRows(items));
  rows.sort((a, b) => latestDate(b) - latestDate(a));
  return rows;
}

/** Jour civil dans le fuseau local (« 2025-06-23 »), comme l'UI des sections. */
function localISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function latestDate(row: TransactionListRow): number {
  if (row.kind === 'single') return new Date(row.transaction.date).getTime();
  return Math.max(...row.items.map((transaction) => new Date(transaction.date).getTime()));
}