import type { Bank } from '../types';

export type SyncFetch = (url: string, init?: { method: string }) => Promise<{
  status: number;
  ok: boolean;
  json: () => Promise<any>;
}>;

export interface SyncAllSummary {
  /** Banques synchronisées avec succès. */
  synced: number;
  imported: number;
  pendingReconciled: number;
  /** Banques refusées par le délai de 2 min du serveur (déjà à jour). */
  skippedCooldown: number;
  /** Banques dont le consentement ou la session a expiré. */
  expired: number;
  /** Banques en erreur : nom + message. */
  failed: { name: string; message: string }[];
  /** Nombre de banques éligibles tentées. */
  attempted: number;
}

/** Banque reliée à Enable Banking, active et dont le consentement n'est pas dépassé. */
export function isSyncEligible(bank: Bank, now: number = Date.now()): boolean {
  if (!bank.ebAccountUid || bank.ebStatus !== 'LINKED' || bank.archived) return false;
  if (bank.ebExpiresAt) {
    const exp = new Date(bank.ebExpiresAt).getTime();
    if (!Number.isNaN(exp) && exp <= now) return false;
  }
  return true;
}

export function eligibleBanks(banks: Bank[], now: number = Date.now()): Bank[] {
  return banks.filter((b) => isSyncEligible(b, now));
}

/**
 * Synchronise séquentiellement toutes les banques éligibles. Une banque en
 * échec n'interrompt pas les suivantes. Mêmes statuts que Banks.handleSync.
 */
export async function syncAllBanks(
  banks: Bank[],
  fetchFn: SyncFetch,
  now: number = Date.now(),
): Promise<SyncAllSummary> {
  const targets = eligibleBanks(banks, now);
  const summary: SyncAllSummary = {
    synced: 0,
    imported: 0,
    pendingReconciled: 0,
    skippedCooldown: 0,
    expired: 0,
    failed: [],
    attempted: targets.length,
  };

  for (const bank of targets) {
    try {
      const res = await fetchFn(`/api/enablebanking/banks/${bank.id}/sync-manual`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        summary.skippedCooldown++;
      } else if (res.status === 403 && (data.error === 'CONSENT_EXPIRED' || data.error === 'SESSION_EXPIRED')) {
        summary.expired++;
      } else if (!res.ok) {
        summary.failed.push({ name: bank.name, message: data.error || `Erreur ${res.status}` });
      } else {
        summary.synced++;
        summary.imported += Number(data.imported) || 0;
        summary.pendingReconciled += Number(data.pendingReconciled) || 0;
      }
    } catch (err: any) {
      summary.failed.push({ name: bank.name, message: err?.message || 'Erreur de synchronisation' });
    }
  }
  return summary;
}
