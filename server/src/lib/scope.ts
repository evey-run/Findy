/**
 * Portée (scope) des données — le seul point de vérité du partage.
 *
 * Tout ce qui est scopable (banques → et donc transactions, objectifs, budgets)
 * appartient à un Espace. Une requête est filtrée par un ensemble d'ids d'espaces.
 *
 * Sécurité : la portée est bornée par les espaces du profil *authentifié*
 * (jeton signé), pas par ce que le client demande. Un `spaceId` en query ne
 * peut que restreindre cette liste, jamais l'élargir.
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

/** Portée impossible à satisfaire : aucune donnée ne sort. */
const NOTHING = ['__none__'];

/**
 * Résout le filtre à appliquer pour le profil authentifié.
 * - `spaceId` fourni et autorisé → cet espace précis
 * - `spaceId` fourni non autorisé → rien
 * - rien → l'union des espaces du profil
 *
 * Sans identité (jeton absent ou invalide), la réponse est vide : aucune route
 * scopée ne doit plus répondre à un appelant anonyme.
 */
export async function resolveScope(query: ScopeQuery, authUserId?: string | null): Promise<string[]> {
  if (!authUserId) return NOTHING;

  const allowed = await spaceIdsForUser(authUserId);
  if (allowed.length === 0) return NOTHING;

  const spaceId = first(query.spaceId);
  if (spaceId) return allowed.includes(spaceId) ? [spaceId] : NOTHING;

  return allowed;
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
