import type { Bank } from '../types';

/**
 * Petites lectures d'un compte, partagées par la carte, la feuille d'actions et
 * l'écran Portefeuille.
 *
 * Elles vivaient dans les composants qui s'en servaient d'abord. Un module de
 * composants ne doit exporter que des composants — c'est la condition du
 * rechargement à chaud de React — et ces trois-là voyageaient de fichier en
 * fichier au gré des besoins.
 */

/** Palette du logotype, stockée en JSON par le serveur. */
export function parseBrandColors(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((color): color is string => typeof color === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Nature d'un compte, en clair. */
export const ACCOUNT_TYPE_LABEL: Record<Bank['accountType'], string> = {
  CURRENT: 'Compte courant',
  SAVINGS: "Livret d'épargne",
  INVESTMENT: 'Investissement',
};

/** Date de dernière synchronisation bancaire, en une ligne. */
export function formatSyncDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Le compte entre-t-il dans le reste à vivre ?
 *
 * `spendable` non renseigné : on retombe sur le type de compte — un livret
 * n'est pas de l'argent qu'on prévoit de dépenser ce mois-ci.
 */
export function spendableForBank(bank: Bank): boolean {
  return bank.spendable ?? bank.accountType === 'CURRENT';
}
