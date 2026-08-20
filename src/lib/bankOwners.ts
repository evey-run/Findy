import type { User } from '../types';

/** Affiche seulement les autres propriétaires d'un portefeuille. */
export function otherBankOwnersSuffix(
  owners: User[] | undefined,
  currentUserId: string | undefined,
): string {
  const names = (owners ?? [])
    .filter((owner) => owner.id !== currentUserId)
    .map((owner) => owner.name.trim())
    .filter(Boolean);

  return names.length ? ` (${names.join(', ')})` : '';
}
