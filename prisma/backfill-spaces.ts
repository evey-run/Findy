/**
 * Backfill des Espaces à partir de l'ancien modèle UserBank.
 *
 * Objectif : après ce script, RIEN ne change de visible dans l'app. Chaque
 * banque atterrit dans un espace dont les membres sont exactement ses anciens
 * propriétaires, et tout ce qui était global (objectifs, budgets) va dans
 * l'espace partagé — puisque tout le monde le voyait déjà. La séparation se
 * fait ensuite à la main, item par item.
 *
 * Idempotent : relançable sans créer de doublons.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Clé canonique d'un ensemble de membres, pour comparer des espaces par leur set. */
function memberKey(userIds: string[]): string {
  return [...new Set(userIds)].sort().join('|');
}

async function main() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
  if (users.length === 0) {
    console.log('Aucun utilisateur — rien à backfiller.');
    return;
  }

  // Index des espaces existants par set de membres (pour l'idempotence).
  const existing = await prisma.space.findMany({ include: { members: true } });
  const byKey = new Map<string, string>();
  for (const space of existing) {
    byKey.set(memberKey(space.members.map((m) => m.userId)), space.id);
  }

  /** Trouve l'espace dont les membres sont exactement `userIds`, sinon le crée. */
  async function spaceFor(userIds: string[], name: string): Promise<string> {
    const key = memberKey(userIds);
    const found = byKey.get(key);
    if (found) return found;

    const space = await prisma.space.create({
      data: {
        name,
        kind: userIds.length === 1 ? 'PERSONAL' : 'SHARED',
        members: { create: [...new Set(userIds)].map((userId) => ({ userId })) }
      }
    });
    byKey.set(key, space.id);
    console.log(`  + espace "${name}" (${userIds.length} membre(s))`);
    return space.id;
  }

  // ── 1. Un espace personnel par utilisateur ──
  console.log('Espaces personnels :');
  const personal = new Map<string, string>();
  for (const user of users) {
    personal.set(user.id, await spaceFor([user.id], user.name));
  }

  // ── 2. Banques : l'espace correspond exactement à ses anciens propriétaires ──
  // On ne crée AUCUN groupe « Famille » d'office : regrouper des personnes est
  // une décision de l'utilisateur, pas une déduction. Les seuls groupes créés
  // ici sont ceux qu'impliquent les comptes réellement détenus à plusieurs.
  const banks = await prisma.bank.findMany({
    where: { spaceId: null },
    include: { userBanks: true }
  });
  console.log(`Banques à rattacher : ${banks.length}`);

  // Espace de repli pour les comptes orphelins et pour ce qui était global.
  // Défini après coup : c'est le groupe issu des comptes joints s'il en existe
  // un, sinon l'espace personnel du profil « Moi ».
  let defaultSpaceId = '';
  for (const bank of banks) {
    const ownerIds = bank.userBanks.map((ub) => ub.userId);

    let spaceId: string;
    if (ownerIds.length === 0) {
      // Banque orpheline : espace du profil « Moi » plutôt que de la perdre.
      const me = users.find((u) => u.isMe) ?? users[0];
      spaceId = personal.get(me.id)!;
      console.log(`  ! "${bank.name}" sans propriétaire → espace de ${me.name}`);
    } else if (ownerIds.length === 1) {
      spaceId = personal.get(ownerIds[0]) ?? (await spaceFor(ownerIds, 'Espace'));
    } else {
      // Plusieurs propriétaires : un groupe dédié nommé d'après ses membres
      // (« Ozan & Léo »), renommable ensuite par l'utilisateur.
      const names = users.filter((u) => ownerIds.includes(u.id)).map((u) => u.name);
      spaceId = await spaceFor(ownerIds, names.join(' & '));
    }

    await prisma.bank.update({ where: { id: bank.id }, data: { spaceId } });
  }

  // Le repli : le plus grand groupe issu des comptes joints, sinon « Moi ».
  const groups = await prisma.space.findMany({
    where: { kind: 'SHARED' },
    include: { members: true, banks: true }
  });
  const biggest = groups
    .filter((g) => g.banks.length > 0)
    .sort((a, b) => b.members.length - a.members.length)[0];
  const me = users.find((u) => u.isMe) ?? users[0];
  defaultSpaceId = biggest?.id ?? personal.get(me.id)!;
  console.log(`Espace de repli pour les données autrefois globales : ${biggest?.name ?? me.name}`);

  // ── 3. Objectifs et budgets : étaient globaux → espace de repli ──
  const obj = await prisma.objective.updateMany({
    where: { spaceId: null },
    data: { spaceId: defaultSpaceId }
  });
  const bud = await prisma.budget.updateMany({
    where: { spaceId: null },
    data: { spaceId: defaultSpaceId }
  });
  console.log(`Objectifs rattachés : ${obj.count} · Budgets : ${bud.count}`);

  // ── 4. Catégories : on les laisse à spaceId = null (catalogue commun). ──
  // C'est le status quo exact, et ça évite de dupliquer la taxonomie par personne.
  const cats = await prisma.category.count();
  console.log(`Catégories laissées au catalogue commun : ${cats}`);

  // ── Contrôle ──
  const orphanBanks = await prisma.bank.count({ where: { spaceId: null } });
  if (orphanBanks > 0) throw new Error(`${orphanBanks} banque(s) encore sans espace`);
  console.log('\n✅ Backfill terminé, aucune banque orpheline.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
