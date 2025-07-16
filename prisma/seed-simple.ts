import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seeding...');

  // Nettoyer les données existantes
  await prisma.transaction.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.recurrence.deleteMany();
  await prisma.userBank.deleteMany();
  await prisma.category.deleteMany();
  await prisma.bank.deleteMany();
  await prisma.user.deleteMany();

  // Créer les utilisateurs
  const user1 = await prisma.user.create({
    data: {
      id: 'user1',
      name: 'Utilisateur 1'
    }
  });

  const user2 = await prisma.user.create({
    data: {
      id: 'user2',
      name: 'Utilisateur 2'
    }
  });

  console.log('✅ Users created');

  // Créer les banques
  const bank1 = await prisma.bank.create({
    data: {
      name: 'Credit mutuel Ozan',
      shortName: 'CM',
      color: '#f8e45c',
      iban: 'FR76 1234 5678 9012 3456 789',
      balance: 2500.00,
      isShared: true
    }
  });

  const bank2 = await prisma.bank.create({
    data: {
      name: 'BNP Paribas',
      shortName: 'BNP',
      color: '#3b82f6',
      iban: 'FR76 9876 5432 1098 7654 321',
      balance: 1800.50,
      isShared: false
    }
  });

  // Créer les relations utilisateur-banque
  await prisma.userBank.create({
    data: {
      userId: user1.id,
      bankId: bank1.id,
      role: 'OWNER'
    }
  });

  await prisma.userBank.create({
    data: {
      userId: user2.id,
      bankId: bank2.id,
      role: 'OWNER'
    }
  });

  // Partager bank1 avec user2
  await prisma.userBank.create({
    data: {
      userId: user2.id,
      bankId: bank1.id,
      role: 'SHARED'
    }
  });

  console.log('✅ Banks and UserBanks created');

  // Créer quelques catégories de base
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Salaire',
        type: 'INCOME',
        color: '#10b981',
        icon: '💰'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Alimentation',
        type: 'EXPENSE',
        color: '#059669',
        icon: '🛒'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Transport',
        type: 'EXPENSE',
        color: '#0ea5e9',
        icon: '🚗'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Loisirs',
        type: 'EXPENSE',
        color: '#8b5cf6',
        icon: '🎯'
      }
    })
  ]);

  console.log('✅ Categories created');

  // Créer quelques transactions d'exemple
  await prisma.transaction.create({
    data: {
      amount: 2800,
      description: 'Salaire mensuel',
      date: new Date(),
      bankId: bank1.id,
      categoryId: categories[0].id
    }
  });

  await prisma.transaction.create({
    data: {
      amount: -45.50,
      description: 'Courses Carrefour',
      date: new Date(Date.now() - 24 * 60 * 60 * 1000), // Hier
      bankId: bank1.id,
      categoryId: categories[1].id
    }
  });

  await prisma.transaction.create({
    data: {
      amount: -12.00,
      description: 'Métro',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Avant-hier
      bankId: bank2.id,
      categoryId: categories[2].id
    }
  });

  console.log('✅ Transactions created');

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
