/**
 * Normalisation et rapprochement des opérations Enable Banking.
 *
 * Ces fonctions décident de ce qui entre en base : un `externalId` mal calculé
 * crée des doublons à chaque synchronisation, un statut mal lu fait réapparaître
 * une opération déjà réconciliée. Elles sont donc isolées de Prisma et du
 * routeur pour être testables directement.
 */
import crypto from 'node:crypto';

export interface NormalizedTransaction {
  externalId: string;
  amount: number;
  date: Date;
  description: string;
  currency: string | null;
  balanceAfterTransaction: number | null;
  status: 'BOOK' | 'PENDING';
}

/**
 * Identifiant de repli quand la banque n'en fournit aucun : la même opération
 * doit produire la même empreinte à chaque synchronisation, sinon elle est
 * réimportée indéfiniment.
 */
export function hashTransactionFallback(date: string, amount: number, description: string): string {
  return crypto.createHash('sha256').update(`${date}|${amount}|${description}`).digest('hex').slice(0, 32);
}

function firstString(value: unknown): string | null {
  if (Array.isArray(value)) {
    const joined = value.filter((item) => typeof item === 'string').join(' ').trim();
    return joined || null;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Traduit une opération PSD2 brute vers le modèle interne. */
export function normalizeTransaction(t: any, now: Date = new Date()): NormalizedTransaction | null {
  if (!t || typeof t !== 'object') return null;

  const rawId = t.entry_reference ?? t.transaction_id;
  const rawAmount = parseFloat(t.transaction_amount?.amount ?? t.amount ?? '0');
  if (Number.isNaN(rawAmount)) return null;

  // PSD2 : le signe n'est pas porté par le montant mais par l'indicateur.
  const amount = t.credit_debit_indicator === 'CRDT' ? rawAmount : -rawAmount;

  const rawDate = t.booking_date ?? t.transaction_date ?? t.value_date;
  const date = rawDate ? new Date(rawDate) : now;
  if (Number.isNaN(date.getTime())) return null;

  const description =
    firstString(t.remittance_information) ??
    firstString(t.creditor?.name) ??
    firstString(t.debtor?.name) ??
    'Transaction';

  // Une opération sans date de comptabilisation n'est pas encore réglée.
  const status: 'BOOK' | 'PENDING' = t.booking_date ? 'BOOK' : 'PENDING';

  const externalId =
    firstString(rawId) ?? hashTransactionFallback(date.toISOString(), amount, description);
  if (!externalId) return null;

  const balAfter = t.balance_after_transaction?.amount;
  const balanceAfterTransaction = balAfter != null && !Number.isNaN(parseFloat(balAfter))
    ? parseFloat(balAfter)
    : null;

  return {
    externalId,
    amount,
    date,
    description,
    currency: t.transaction_amount?.currency ?? null,
    balanceAfterTransaction,
    status,
  };
}

export interface ExistingTransaction {
  id: string;
  externalId: string | null;
  status: string | null;
  balanceAfterTransaction: number | null;
}

export interface TransactionUpdate {
  id: string;
  status?: 'BOOK';
  balanceAfterTransaction?: number;
}

export interface ReconciliationPlan {
  toCreate: NormalizedTransaction[];
  toUpdate: TransactionUpdate[];
  skipped: number;
  pendingReconciled: number;
}

/**
 * Compare le lot reçu à ce qui existe déjà et décide, sans rien écrire :
 * créer, réconcilier (PENDING → BOOK), compléter un solde manquant, ou ignorer.
 *
 * Le lot lui-même peut contenir deux fois la même opération (pagination qui se
 * chevauche) : la déduplication se fait donc aussi à l'intérieur du lot.
 */
export function planReconciliation(
  incoming: NormalizedTransaction[],
  existing: ExistingTransaction[],
): ReconciliationPlan {
  const byExternalId = new Map<string, ExistingTransaction>();
  for (const row of existing) {
    if (row.externalId) byExternalId.set(row.externalId, row);
  }

  const plan: ReconciliationPlan = { toCreate: [], toUpdate: [], skipped: 0, pendingReconciled: 0 };
  const seen = new Set<string>();

  for (const tx of incoming) {
    if (seen.has(tx.externalId)) {
      plan.skipped++;
      continue;
    }
    seen.add(tx.externalId);

    const match = byExternalId.get(tx.externalId);
    if (!match) {
      plan.toCreate.push(tx);
      continue;
    }

    if (match.status === 'PENDING' && tx.status === 'BOOK') {
      plan.toUpdate.push({ id: match.id, status: 'BOOK' });
      plan.pendingReconciled++;
    }
    if (match.balanceAfterTransaction == null && tx.balanceAfterTransaction != null) {
      plan.toUpdate.push({ id: match.id, balanceAfterTransaction: tx.balanceAfterTransaction });
    }
    plan.skipped++;
  }

  return plan;
}

/** Message d'alerte sur l'expiration du consentement, ou `null`. */
export function consentWarning(
  bank: { ebExpiresAt: Date | null; ebStatus: string | null; name: string },
  now: Date = new Date(),
): string | null {
  if (bank.ebStatus !== 'LINKED' || !bank.ebExpiresAt) return null;

  const daysUntilExpiry = Math.ceil((bank.ebExpiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (daysUntilExpiry <= 0) {
    return `Le consentement de ${bank.name} a expiré. Veuillez réauthentifier.`;
  }
  if (daysUntilExpiry <= 7) {
    return `Le consentement de ${bank.name} expire dans ${daysUntilExpiry} jour(s). Réauthentifiez bientôt.`;
  }
  return null;
}
