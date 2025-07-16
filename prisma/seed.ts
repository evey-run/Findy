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
        name: 'Électricité',
        type: 'FIXED',
        color: '#f59e0b',
        icon: '⚡'
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
    
    // Dépenses
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
    })
  ]);

  const [salaire, freelance, loyer, electricite, box, alimentation, transport, loisirs, sante, vetements] = categories;

  console.log('✅ Categories created');

  // Créer des récurrences (charges fixes et salaires)
  const currentDate = new Date();
  const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);

  await Promise.all([
    // Salaires
    prisma.recurrence.create({
      data: {
        amount: 2800,
        frequency: 'MONTHLY',
        nextDue: new Date(currentDate.getFullYear(), currentDate.getMonth(), 28),
        description: 'Salaire Alex',
        shared: false,
        userId: user1.id,
        categoryId: salaire.id
      }
    }),
    prisma.recurrence.create({
      data: {
        amount: 2500,
        frequency: 'MONTHLY',
        nextDue: new Date(currentDate.getFullYear(), currentDate.getMonth(), 30),
        description: 'Salaire Sam',
        shared: false,
        userId: user2.id,
        categoryId: salaire.id
      }
    }),

    // Charges fixes partagées
    prisma.recurrence.create({
      data: {
        amount: -1200,
        frequency: 'MONTHLY',
        nextDue: new Date(currentDate.getFullYear(), currentDate.getMonth(), 5),
        description: 'Loyer appartement',
        shared: true,
        userId: null,
        categoryId: loyer.id
      }
    }),
    prisma.recurrence.create({
      data: {
        amount: -120,
        frequency: 'MONTHLY',
        nextDue: new Date(currentDate.getFullYear(), currentDate.getMonth(), 15),
        description: 'Facture électricité',
        shared: true,
        userId: null,
        categoryId: electricite.id
      }
    }),
    prisma.recurrence.create({
      data: {
        amount: -45,
        frequency: 'MONTHLY',
        nextDue: new Date(currentDate.getFullYear(), currentDate.getMonth(), 10),
        description: 'Box internet',
        shared: true,
        userId: null,
        categoryId: box.id
      }
    })
  ]);

  console.log('✅ Recurrences created');

  // Créer des budgets
  await Promise.all([
    prisma.budget.create({
      data: {
        amount: 600,
        period: 'MONTHLY',
        shared: true,
        userId: null,
        categoryId: alimentation.id
      }
    }),
    prisma.budget.create({
      data: {
        amount: 200,
        period: 'MONTHLY',
        shared: false,
        userId: user1.id,
        categoryId: transport.id
      }
    }),
    prisma.budget.create({
      data: {
        amount: 150,
        period: 'MONTHLY',
        shared: false,
        userId: user2.id,
        categoryId: transport.id
      }
    }),
    prisma.budget.create({
      data: {
        amount: 300,
        period: 'MONTHLY',
        shared: true,
        userId: null,
        categoryId: loisirs.id
      }
    })
  ]);

  console.log('✅ Budgets created');

  // Créer des transactions d'exemple pour le mois actuel
  const transactions: any[] = [];
  
  // Quelques transactions récentes
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    const randomUser = Math.random() > 0.5 ? user1 : user2;
    const randomCategory = [alimentation, transport, loisirs, sante, vetements][Math.floor(Math.random() * 5)];
    const amount = -(Math.random() * 100 + 10); // Dépenses entre 10 et 110
    
    transactions.push({
      amount: Math.round(amount * 100) / 100,
      description: `Achat ${randomCategory.name.toLowerCase()}`,
      date,
      shared: Math.random() > 0.7, // 30% de chance d'être partagé
      userId: randomUser.id,
      categoryId: randomCategory.id
    });
  }

  // Ajouter quelques revenus
  transactions.push(
    {
      amount: 2800,
      description: 'Salaire Alex - ' + new Date().toLocaleDateString('fr'),
      date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 28),
      shared: false,
      userId: user1.id,
      categoryId: salaire.id
    },
    {
      amount: 2500,
      description: 'Salaire Sam - ' + new Date().toLocaleDateString('fr'),
      date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 30),
      shared: false,
      userId: user2.id,
      categoryId: salaire.id
    },
    {
      amount: 500,
      description: 'Mission freelance',
      date: new Date(currentDate.getFullYear(), currentDate.getMonth(), 15),
      shared: false,
      userId: user1.id,
      categoryId: freelance.id
    }
  );

  // Ajouter les charges fixes du mois dernier
  transactions.push(
    {
      amount: -1200,
      description: 'Loyer appartement',
      date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 5),
      shared: true,
      userId: user1.id, // Payé par Alex mais partagé
      categoryId: loyer.id
    },
    {
      amount: -120,
      description: 'Facture électricité',
      date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 15),
      shared: true,
      userId: user2.id, // Payé par Sam mais partagé
      categoryId: electricite.id
    },
    {
      amount: -45,
      description: 'Box internet',
      date: new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 10),
      shared: true,
      userId: user1.id,
      categoryId: box.id
    }
  );

  await Promise.all(
    transactions.map(transaction => 
      prisma.transaction.create({ data: transaction })
    )
  );

  console.log('✅ Transactions created');

  const userCount = await prisma.user.count();
  const categoryCount = await prisma.category.count();
  const transactionCount = await prisma.transaction.count();
  const budgetCount = await prisma.budget.count();
  const recurrenceCount = await prisma.recurrence.count();

  console.log('🎉 Seeding completed!');
  console.log(`📊 Created: ${userCount} users, ${categoryCount} categories, ${transactionCount} transactions, ${budgetCount} budgets, ${recurrenceCount} recurrences`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
