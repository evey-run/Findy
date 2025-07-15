import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seeding...');

  // Nettoyer les données existantes
  await prisma.transaction.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.recurrence.deleteMany();
  await prisma.category.deleteMany();
  await prisma.bank.deleteMany();

  // Créer les banques
  const bank1 = await prisma.bank.create({
    data: {
      name: 'Crédit Agricole',
      shortName: 'CA',
      color: '#22c55e',
      iban: 'FR76 1234 5678 9012 3456 789',
      balance: 2500.00
    }
  });

  const bank2 = await prisma.bank.create({
    data: {
      name: 'BNP Paribas',
      shortName: 'BNP',
      color: '#3b82f6',
      iban: 'FR76 9876 5432 1098 7654 321',
      balance: 1800.50
    }
  });

  const bank3 = await prisma.bank.create({
    data: {
      name: 'Livret A',
      shortName: 'LA',
      color: '#f59e0b',
      balance: 5000.00
    }
  });

  console.log('✅ Banks created');

  // Créer les catégories
  const categories = await Promise.all([
    // Revenus
    prisma.category.create({
      data: {
        name: 'Salaire',
        type: 'INCOME',
        color: '#22c55e',
        icon: '💰'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Freelance',
        type: 'INCOME',
        color: '#16a34a',
        icon: '💻'
      }
    }),
    
    // Charges fixes
    prisma.category.create({
      data: {
        name: 'Loyer',
        type: 'FIXED',
        color: '#dc2626',
        icon: '🏠'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Internet/Box',
        type: 'FIXED',
        color: '#6366f1',
        icon: '📶'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Électricité',
        type: 'FIXED',
        color: '#f59e0b',
        icon: '⚡'
      }
    }),
    
    // Dépenses variables
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
        name: 'Loisirs',
        type: 'EXPENSE',
        color: '#8b5cf6',
        icon: '🎬'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Santé',
        type: 'EXPENSE',
        color: '#ef4444',
        icon: '⚕️'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Vêtements',
        type: 'EXPENSE',
        color: '#f97316',
        icon: '👕'
      }
    }),
    prisma.category.create({
      data: {
        name: 'Transport',
        type: 'EXPENSE',
        color: '#0ea5e9',
        icon: '🚗'
      }
    })
  ]);

  const [salaire, freelance, loyer, internet, electricite, alimentation, loisirs, sante, vetements, transport] = categories;

  console.log('✅ Categories created');

  // Créer des récurrences
  const recurrences = await Promise.all([
    // Revenus récurrents
    prisma.recurrence.create({
      data: {
        amount: 2800,
        frequency: 'MONTHLY',
        nextDue: new Date('2025-07-28'),
        description: 'Salaire mensuel - Crédit Agricole',
        shared: false,
        active: true,
        bankId: bank1.id,
        categoryId: salaire.id
      }
    }),
    prisma.recurrence.create({
      data: {
        amount: 2500,
        frequency: 'MONTHLY',
        nextDue: new Date('2025-07-30'),
        description: 'Salaire mensuel - BNP',
        shared: false,
        active: true,
        bankId: bank2.id,
        categoryId: salaire.id
      }
    }),
    
    // Charges fixes récurrentes
    prisma.recurrence.create({
      data: {
        amount: -1200,
        frequency: 'MONTHLY',
        nextDue: new Date('2025-08-05'),
        description: 'Loyer appartement',
        shared: true,
        active: true,
        bankId: bank1.id,
        categoryId: loyer.id
      }
    }),
    prisma.recurrence.create({
      data: {
        amount: -45,
        frequency: 'MONTHLY',
        nextDue: new Date('2025-08-10'),
        description: 'Box internet',
        shared: true,
        active: true,
        bankId: bank1.id,
        categoryId: internet.id
      }
    }),
    prisma.recurrence.create({
      data: {
        amount: -120,
        frequency: 'MONTHLY',
        nextDue: new Date('2025-08-15'),
        description: 'Facture électricité',
        shared: true,
        active: true,
        bankId: bank2.id,
        categoryId: electricite.id
      }
    })
  ]);

  console.log('✅ Recurrences created');

  // Créer des budgets
  const budgets = await Promise.all([
    prisma.budget.create({
      data: {
        amount: 500,
        period: 'MONTHLY',
        startDate: new Date('2025-07-01'),
        shared: false,
        bankId: bank1.id,
        categoryId: alimentation.id
      }
    }),
    prisma.budget.create({
      data: {
        amount: 200,
        period: 'MONTHLY',
        startDate: new Date('2025-07-01'),
        shared: false,
        bankId: bank2.id,
        categoryId: loisirs.id
      }
    }),
    prisma.budget.create({
      data: {
        amount: 300,
        period: 'MONTHLY',
        startDate: new Date('2025-07-01'),
        shared: true,
        categoryId: transport.id
      }
    }),
    prisma.budget.create({
      data: {
        amount: 150,
        period: 'MONTHLY',
        startDate: new Date('2025-07-01'),
        shared: false,
        bankId: bank1.id,
        categoryId: vetements.id
      }
    })
  ]);

  console.log('✅ Budgets created');

  // Créer des transactions d'exemple
  const transactions: any[] = [];
  
  // Quelques transactions récentes
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const randomBank = Math.random() > 0.5 ? bank1 : bank2;
    const randomCategory = [alimentation, transport, loisirs, sante, vetements][Math.floor(Math.random() * 5)];
    const amount = -(Math.random() * 100 + 10); // Dépenses entre 10 et 110
    
    transactions.push({
      amount: Math.round(amount * 100) / 100,
      description: `Achat ${randomCategory.name.toLowerCase()}`,
      date: date,
      shared: Math.random() > 0.6,
      bankId: randomBank.id,
      categoryId: randomCategory.id
    });
  }

  // Quelques revenus
  transactions.push(
    {
      amount: 2800,
      description: 'Salaire CA - 15/07/2025',
      date: new Date('2025-06-28'),
      shared: false,
      bankId: bank1.id,
      categoryId: salaire.id
    },
    {
      amount: 2500,
      description: 'Salaire BNP - 15/07/2025',
      date: new Date('2025-06-30'),
      shared: false,
      bankId: bank2.id,
      categoryId: salaire.id
    },
    {
      amount: 500,
      description: 'Mission freelance',
      date: new Date('2025-07-15'),
      shared: false,
      bankId: bank1.id,
      categoryId: freelance.id
    }
  );

  // Charges fixes
  transactions.push(
    {
      amount: -1200,
      description: 'Loyer appartement',
      date: new Date('2025-06-05'),
      shared: true,
      bankId: bank1.id,
      categoryId: loyer.id
    },
    {
      amount: -45,
      description: 'Box internet',
      date: new Date('2025-06-10'),
      shared: true,
      bankId: bank1.id,
      categoryId: internet.id
    },
    {
      amount: -120,
      description: 'Facture électricité',
      date: new Date('2025-06-15'),
      shared: true,
      bankId: bank2.id,
      categoryId: electricite.id
    }
  );

  // Insérer toutes les transactions
  await prisma.transaction.createMany({
    data: transactions
  });

  console.log('✅ Transactions created');

  // Statistiques finales
  const finalStats = await Promise.all([
    prisma.bank.count(),
    prisma.category.count(),
    prisma.transaction.count(),
    prisma.budget.count(),
    prisma.recurrence.count()
  ]);

  console.log('🎉 Seeding completed!');
  console.log(`📊 Created: ${finalStats[0]} banks, ${finalStats[1]} categories, ${finalStats[2]} transactions, ${finalStats[3]} budgets, ${finalStats[4]} recurrences`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
