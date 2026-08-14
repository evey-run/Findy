/**
 * Portée (scope) des données — le seul point de vérité du partage.
 *
 * Tout ce qui est scopable (banques → et donc transactions, objectifs, budgets)
 * appartient à un Espace. Une requête est filtrée par un ensemble d'ids d'espaces.
 *
 * ⚠️ Sécurité : le scope vient encore des query params, donc c'est un filtre
 * d'affichage, pas une frontière d'autorisation. Le jour où l'API est exposée
 * (tunnel ngrok), il faudra dériver `userId` d'un token de session signé.
 */
import prisma from '../prisma';

/** Tous les espaces dont l'utilisateur est membre (perso + partagés). */
export async function spaceIdsForUser(userId: string): Promise<string[]> {
  const rows = await prisma.spaceMember.findMany({
    where: { userId },
    select: { spaceId: true }
  });
  return rows.map((r) => r.spaceId);
}

export interface ScopeQuery {
  spaceId?: string | string[];
  userId?: string | string[];
}

function first(v?: string | string[]): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Résout le filtre à appliquer.
 * - `spaceId` fourni  → cet espace précis (et seulement lui)
 * - `userId` fourni   → l'union des espaces de cet utilisateur (scope « Tout »)
 * - rien              → `null` = aucun filtre (vue globale)
 */
export async function resolveScope(query: ScopeQuery): Promise<string[] | null> {
  const spaceId = first(query.spaceId);
  if (spaceId) return [spaceId];

  const userId = first(query.userId);
  if (userId) {
    const ids = await spaceIdsForUser(userId);
    // Un utilisateur sans espace ne doit rien voir — surtout pas tout.
    return ids.length > 0 ? ids : ['__none__'];
  }

  return null;
}

/** Clause Prisma pour les entités portant directement un `spaceId`. */
export function spaceWhere(scope: string[] | null) {
  return scope ? { spaceId: { in: scope } } : {};
}

/** Clause Prisma pour les transactions : la portée est celle de leur banque. */
export function transactionSpaceWhere(scope: string[] | null) {
  return scope ? { bank: { spaceId: { in: scope } } } : {};
}

/**
 * Clause pour les catégories : `spaceId = null` est le catalogue commun,
 * toujours visible. Une catégorie rattachée à un espace n'est visible que
 * par les membres de cet espace.
 */
export function categoryWhere(scope: string[] | null) {
  return scope ? { OR: [{ spaceId: null }, { spaceId: { in: scope } }] } : {};
}

/** Clé canonique d'un ensemble de membres, pour comparer des espaces par leur set. */
function memberKey(userIds: string[]): string {
  return [...new Set(userIds)].sort().join('|');
}

/**
 * Trouve l'espace dont les membres sont *exactement* `userIds`, sinon le crée.
 * C'est ce qui permet à l'UI existante (« qui possède ce compte ? ») de continuer
 * à fonctionner : on coche des personnes, le serveur en déduit l'espace.
 */
export async function resolveSpaceForUsers(userIds: string[]): Promise<string> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) throw new Error('Au moins un membre est requis');

  const key = memberKey(unique);
  const candidates = await prisma.space.findMany({ include: { members: true } });
  const match = candidates.find((s) => memberKey(s.members.map((m) => m.userId)) === key);
  if (match) return match.id;

  const users = await prisma.user.findMany({ where: { id: { in: unique } } });
  // Nom déduit des membres, jamais inventé : l'utilisateur le renomme ensuite
  // (« Famille », « Tout », « Coloc »…) depuis les Paramètres.
  const name = unique.length === 1
    ? users[0]?.name ?? 'Espace'
    : users.map((u) => u.name).join(' & ');

  const space = await prisma.space.create({
    data: {
      name,
      kind: unique.length === 1 ? 'PERSONAL' : 'SHARED',
      members: { create: unique.map((userId) => ({ userId })) }
    }
  });
  return space.id;
}

/**
 * Espace par défaut d'un utilisateur pour créer un nouvel item quand l'UI n'en
 * précise pas : son espace personnel.
 */
export async function personalSpaceId(userId: string): Promise<string> {
  return resolveSpaceForUsers([userId]);
}
