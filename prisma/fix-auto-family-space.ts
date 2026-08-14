/**
 * Retire l'espace « Famille » créé automatiquement par le backfill.
 *
 * Créer un groupe est une décision de l'utilisateur, pas une déduction : le
 * backfill n'aurait jamais dû en inventer un. Cet espace regroupait *tous* les
 * profils (y compris un profil de test), ne contenait aucun compte, et servait
 * pourtant de rattachement aux objectifs/budgets autrefois globaux.
 *
 * On déplace son contenu vers le vrai groupe existant (celui déduit des comptes
 * joints), puis on le supprime. Idempotent : ne fait rien s'il a déjà disparu.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userCount = await prisma.user.count();

  const spaces = await prisma.space.findMany({
    include: { members: true, banks: true, objectives: true, budgets: true, categories: true }
  });

  // L'espace auto-créé se reconnaît à : partagé, contient TOUS les profils,
  // et n'a aucun compte (les comptes joints ont leur propre espace).
  const auto = spaces.find(
    (s) => s.kind === 'SHARED' && s.members.length === userCount && userCount > 1 && s.banks.length === 0
  );

  if (!auto) {
    console.log('Aucun espace auto-créé à retirer.');
    return;
  }

  // Cible : le groupe partagé qui a réellement des comptes, sinon l'espace
  // personnel du profil « Moi » — pour ne rien faire disparaître.
  const realGroup = spaces.find((s) => s.kind === 'SHARED' && s.id !== auto.id && s.banks.length > 0);
  let targetId = realGroup?.id;
  let targetName = realGroup?.name;

  if (!targetId) {
    const me = await prisma.user.findFirst({ where: { isMe: true } });
    const personal = spaces.find(
      (s) => s.kind === 'PERSONAL' && s.members.length === 1 && (!me || s.members[0].userId === me.id)
    );
    targetId = personal?.id;
    targetName = personal?.name;
  }

  if (!targetId) {
    throw new Error('Aucun espace cible trouvé — abandon pour ne rien perdre.');
  }

  console.log(`Déplacement du contenu de "${auto.name}" vers "${targetName}" :`);
  console.log(`  ${auto.objectives.length} objectif(s), ${auto.budgets.length} budget(s), ${auto.categories.length} catégorie(s)`);

  await prisma.$transaction([
    prisma.objective.updateMany({ where: { spaceId: auto.id }, data: { spaceId: targetId } }),
    prisma.budget.updateMany({ where: { spaceId: auto.id }, data: { spaceId: targetId } }),
    prisma.category.updateMany({ where: { spaceId: auto.id }, data: { spaceId: targetId } }),
    prisma.spaceMember.deleteMany({ where: { spaceId: auto.id } }),
    prisma.space.delete({ where: { id: auto.id } })
  ]);

  console.log(`✅ Espace "${auto.name}" supprimé.`);

  // Contrôle : plus personne ne doit se retrouver sans aucun espace.
  const orphans = await prisma.user.findMany({
    where: { spaceMembers: { none: {} } },
    select: { name: true }
  });
  if (orphans.length) {
    console.log(`⚠️  Profils sans espace : ${orphans.map((o) => o.name).join(', ')}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
