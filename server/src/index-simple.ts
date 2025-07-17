import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

// Configuration multer pour l'upload d'images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'public/uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'bank-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers images sont autorisés'));
    }
  }
});

// Configuration multer pour l'upload d'avatars
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(process.cwd(), 'public/uploads/avatars');
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers images sont autorisés'));
    }
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Middleware de log global
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.url}`);
  console.log('🌐 Headers:', req.headers);
  next();
});

// Serve static files (images)
app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

// API Routes simples pour tester

// Users routes
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        userBanks: {
          include: {
            bank: true
          },
          orderBy: {
            bank: {
              createdAt: 'desc'
            }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        userBanks: {
          include: {
            bank: true
          },
          orderBy: {
            bank: {
              createdAt: 'desc'
            }
          }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/banks', async (req, res) => {
  try {
    const { userId, archived } = req.query;
    
    // Construire le where clause
    const whereClause: any = {};
    
    // Filtre par archived seulement si spécifié
    if (archived !== undefined) {
      whereClause.archived = archived === 'true';
    }
    
    let banks;
    if (userId) {
      // Get banks for a specific user
      banks = await prisma.bank.findMany({
        where: {
          ...whereClause,
          userBanks: {
            some: {
              userId: userId as string
            }
          }
        },
        include: {
          userBanks: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    } else {
      // Get all banks
      banks = await prisma.bank.findMany({
        where: whereClause,
        include: {
          userBanks: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
    }
    
    // Transform the data to include computed fields
    const transformedBanks = banks.map(bank => ({
      ...bank,
      users: bank.userBanks.map(ub => ub.user),
      owners: bank.userBanks.filter(ub => ub.role === 'OWNER').map(ub => ub.user),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
    }));
    
    res.json(transformedBanks);
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// POST - Créer une nouvelle banque
app.post('/api/banks', upload.single('image'), async (req, res) => {
  console.log('🔧 POST /api/banks called with body:', req.body);
  console.log('🔧 File:', req.file);
  try {
    const { name, shortName, color, iban, balance, accountType, userId, isShared, sharedUserIds } = req.body;
    
    console.log('🔧 Extracted data:', { name, shortName, color, iban, balance, accountType, userId, isShared, sharedUserIds });
    
    if (!userId) {
      console.log('🔧 Error: userId is required');
      return res.status(400).json({ error: 'userId is required' });
    }
    
    if (!name) {
      console.log('🔧 Error: name is required');
      return res.status(400).json({ error: 'name is required' });
    }
    
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    const bank = await prisma.bank.create({
      data: {
        name,
        shortName,
        color: '#3b82f6', // Couleur par défaut
        image: imageUrl,
        iban,
        balance: parseFloat(balance) || 0,
        accountType: accountType || 'CURRENT',
        isShared: isShared || false,
        userBanks: {
          create: [
            // Owner
            {
              userId: userId,
              role: 'OWNER'
            },
            // Shared users if any
            ...(sharedUserIds && Array.isArray(sharedUserIds) ? 
              sharedUserIds.map((id: string) => ({
                userId: id,
                role: 'SHARED' as const
              })) : [])
          ]
        }
      },
      include: {
        userBanks: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          }
        }
      }
    });
    
    // Transform the data to include computed fields
    const transformedBank = {
      ...bank,
      users: bank.userBanks.map(ub => ub.user),
      owners: bank.userBanks.filter(ub => ub.role === 'OWNER').map(ub => ub.user),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
    };
    
    res.status(201).json(transformedBank);
  } catch (error) {
    console.error('🔧 Error creating bank:', error);
    console.error('🔧 Error message:', error.message);
    console.error('🔧 Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create bank', details: error.message });
  }
});

// PUT - Modifier une banque existante
app.put('/api/banks/:id', upload.single('image'), async (req, res) => {
  try {
    const bankId = req.params.id;
    const { name, shortName, iban, balance } = req.body;
    
    const updateData: any = {
      name,
      shortName,
      iban,
      balance: parseFloat(balance)
    };
    
    // Add image if uploaded
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }
    
    const bank = await prisma.bank.update({
      where: { id: bankId },
      data: updateData,
      include: {
        userBanks: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          }
        }
      }
    });
    
    // Transform the data to include computed fields
    const transformedBank = {
      ...bank,
      users: bank.userBanks.map(ub => ub.user),
      owners: bank.userBanks.filter(ub => ub.role === 'OWNER').map(ub => ub.user),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
    };
    
    res.json(transformedBank);
  } catch (error) {
    console.error('Error updating bank:', error);
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// DELETE - Supprimer ou archiver une banque
app.delete('/api/banks/:id', async (req, res) => {
  try {
    const bankId = req.params.id;
    
    // Vérifier s'il y a des transactions liées à cette banque
    const transactionCount = await prisma.transaction.count({
      where: { bankId }
    });
    
    if (transactionCount > 0) {
      // Si des transactions existent, archiver la banque
      await prisma.bank.update({
        where: { id: bankId },
        data: { 
          archived: true,
          archivedAt: new Date()
        }
      });
      
      res.json({ 
        message: 'Bank archived successfully',
        archived: true,
        transactionCount 
      });
    } else {
      // Si aucune transaction, supprimer définitivement
      await prisma.bank.delete({
        where: { id: bankId }
      });
      
      res.json({ 
        message: 'Bank deleted successfully',
        archived: false 
      });
    }
  } catch (error) {
    console.error('Error deleting/archiving bank:', error);
    res.status(500).json({ error: 'Failed to delete/archive bank' });
  }
});

// PUT - Restaurer une banque archivée
app.put('/api/banks/:id/restore', async (req, res) => {
  try {
    const bankId = req.params.id;
    
    const bank = await prisma.bank.update({
      where: { id: bankId },
      data: { 
        archived: false,
        archivedAt: null
      },
      include: {
        userBanks: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true
              }
            }
          }
        }
      }
    });
    
    // Transform the data to include computed fields
    const transformedBank = {
      ...bank,
      users: bank.userBanks.map(ub => ub.user),
      owners: bank.userBanks.filter(ub => ub.role === 'OWNER').map(ub => ub.user),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
    };
    
    res.json(transformedBank);
  } catch (error) {
    console.error('Error restoring bank:', error);
    res.status(500).json({ error: 'Failed to restore bank' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories - Créer une nouvelle catégorie
app.post('/api/categories', async (req, res) => {
  try {
    const { name, type, color, icon } = req.body;
    
    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }
    
    if (!['INCOME', 'EXPENSE', 'FIXED'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' });
    }
    
    const category = await prisma.category.create({
      data: {
        name,
        type,
        color: color || '#6b7280',
        icon
      }
    });
    
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// PUT /api/categories/:id - Mettre à jour une catégorie
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, color, icon } = req.body;
    
    if (type && !['INCOME', 'EXPENSE', 'FIXED'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' });
    }
    
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(color && { color }),
        ...(icon !== undefined && { icon })
      }
    });
    
    res.json(category);
  } catch (error: any) {
    console.error('Error updating category:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Supprimer une catégorie
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Vérifier si la catégorie est utilisée
    const count = await prisma.category.findUnique({
      where: { id },
      select: {
        _count: {
          select: {
            transactions: true,
            budgets: true,
            recurrences: true
          }
        }
      }
    });
    
    if (count && (count._count.transactions > 0 || count._count.budgets > 0 || count._count.recurrences > 0)) {
      return res.status(400).json({ 
        error: 'Cannot delete category that is being used in transactions, budgets, or recurrences' 
      });
    }
    
    await prisma.category.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting category:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const { bankId, categoryId, shared, startDate, endDate, accountType } = req.query;
    
    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (categoryId) where.categoryId = categoryId;
    if (shared !== undefined) where.shared = shared === 'true';
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }
    
    // Filtrer par type de compte si spécifié
    if (accountType) {
      if (bankId) {
        // Si on a déjà un bankId, on doit combiner les filtres
        where.bank = {
          id: bankId,
          accountType: accountType as string
        };
        delete where.bankId; // Supprimer le filtre bankId simple
      } else {
        where.bank = {
          accountType: accountType as string
        };
      }
    }
    
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            balance: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// POST /api/transactions - Créer une nouvelle transaction
app.post('/api/transactions', async (req, res) => {
  try {
    const { amount, description, date, shared, bankId, categoryId } = req.body;
    
    if (!amount || !description || !bankId || !categoryId) {
      return res.status(400).json({ 
        error: 'Amount, description, bankId, and categoryId are required' 
      });
    }
    
    const transaction = await prisma.transaction.create({
      data: {
        amount: parseFloat(amount),
        description,
        date: date ? new Date(date) : new Date(),
        shared: shared || false,
        bankId,
        categoryId
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            balance: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    res.status(201).json(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// PUT /api/transactions/:id - Mettre à jour une transaction
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, date, shared, categoryId, bankId } = req.body;
    
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(description && { description }),
        ...(date && { date: new Date(date) }),
        ...(shared !== undefined && { shared }),
        ...(categoryId && { categoryId }),
        ...(bankId && { bankId })
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            balance: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    res.json(transaction);
  } catch (error: any) {
    console.error('Error updating transaction:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// DELETE /api/transactions/:id - Supprimer une transaction
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.transaction.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting transaction:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

app.get('/api/budgets', async (req, res) => {
  try {
    const { bankId, categoryId, period, shared } = req.query;
    
    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (categoryId) where.categoryId = categoryId;
    if (period) where.period = period;
    if (shared !== undefined) where.shared = shared === 'true';
    
    const budgets = await prisma.budget.findMany({
      where,
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            balance: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(budgets);
  } catch (error) {
    console.error('Error fetching budgets:', error);
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
});

// POST /api/budgets - Créer un nouveau budget
app.post('/api/budgets', async (req, res) => {
  try {
    const { amount, period, startDate, shared, bankId, categoryId } = req.body;
    
    if (!amount || !categoryId) {
      return res.status(400).json({ 
        error: 'Amount and categoryId are required' 
      });
    }
    
    const budget = await prisma.budget.create({
      data: {
        amount: parseFloat(amount),
        period: period || 'MONTHLY',
        startDate: startDate ? new Date(startDate) : new Date(),
        shared: shared || false,
        bankId: bankId || null,
        categoryId
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            balance: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    res.status(201).json(budget);
  } catch (error) {
    console.error('Error creating budget:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
});

// PUT /api/budgets/:id - Mettre à jour un budget
app.put('/api/budgets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, period, startDate, shared } = req.body;
    
    const budget = await prisma.budget.update({
      where: { id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(period && { period }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(shared !== undefined && { shared })
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true,
            balance: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      }
    });
    
    res.json(budget);
  } catch (error: any) {
    console.error('Error updating budget:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.status(500).json({ error: 'Failed to update budget' });
  }
});

// DELETE /api/budgets/:id - Supprimer un budget
app.delete('/api/budgets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.budget.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting budget:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Budget not found' });
    }
    res.status(500).json({ error: 'Failed to delete budget' });
  }
});

// GET /api/budgets/:id/spending - Obtenir les dépenses pour un budget
app.get('/api/budgets/:id/spending', async (req, res) => {
  try {
    const { id } = req.params;
    
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: {
        category: true,
        bank: true
      }
    });
    
    if (!budget) {
      return res.status(404).json({ error: 'Budget not found' });
    }
    
    // Calculer la période actuelle
    const startDate = new Date(budget.startDate);
    const endDate = new Date(startDate);
    
    switch (budget.period) {
      case 'WEEKLY':
        endDate.setDate(startDate.getDate() + 7);
        break;
      case 'MONTHLY':
        endDate.setMonth(startDate.getMonth() + 1);
        break;
      case 'QUARTERLY':
        endDate.setMonth(startDate.getMonth() + 3);
        break;
      case 'YEARLY':
        endDate.setFullYear(startDate.getFullYear() + 1);
        break;
    }
    
    // Récupérer les transactions pour cette période
    const where: any = {
      categoryId: budget.categoryId,
      date: {
        gte: startDate,
        lt: endDate
      }
    };
    
    if (budget.bankId) {
      where.bankId = budget.bankId;
    }
    
    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        bank: true
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    const totalSpent = transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const remaining = budget.amount - totalSpent;
    const percentage = budget.amount > 0 ? (totalSpent / budget.amount) * 100 : 0;
    
    res.json({
      budget,
      transactions,
      totalSpent,
      remaining,
      percentage,
      isOverBudget: totalSpent > budget.amount,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString()
    });
  } catch (error) {
    console.error('Error fetching budget spending:', error);
    res.status(500).json({ error: 'Failed to fetch budget spending' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// PUT /api/users/:id - Update a user
app.put('/api/users/:id', uploadAvatar.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    // Préparer les données de mise à jour
    const updateData: any = {
      name
    };
    
    // Si un nouvel avatar est uploadé
    if (req.file) {
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
      
      // Supprimer l'ancien avatar si il existe
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { avatar: true }
      });
      
      if (existingUser?.avatar) {
        const oldAvatarPath = path.join(process.cwd(), 'public', existingUser.avatar);
        try {
          if (require('fs').existsSync(oldAvatarPath)) {
            require('fs').unlinkSync(oldAvatarPath);
          }
        } catch (error) {
          console.error('Error deleting old avatar:', error);
        }
      }
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        userBanks: {
          include: {
            bank: true
          }
        }
      }
    });
    
    res.json(user);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/recurrences/process - Traiter les récurrences dues
app.post('/api/recurrences/process', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Fin de la journée pour inclure toutes les heures
    
    // Trouver toutes les récurrences actives dues aujourd'hui ou avant
    const dueRecurrences = await prisma.recurrence.findMany({
      where: {
        active: true,
        nextDue: {
          lte: today
        }
      },
      include: {
        bank: true,
        category: true
      }
    });
    
    let processedCount = 0;
    const results: any[] = [];
    
    for (const recurrence of dueRecurrences) {
      try {
        // Vérifier que la récurrence a une banque associée
        if (!recurrence.bankId) {
          console.warn(`Skipping recurrence ${recurrence.id} - no bank associated`);
          continue;
        }
        
        // Créer une transaction pour cette récurrence
        const transaction = await prisma.transaction.create({
          data: {
            amount: recurrence.amount,
            description: `${recurrence.description} (récurrence)`,
            date: recurrence.nextDue,
            shared: recurrence.shared,
            bankId: recurrence.bankId,
            categoryId: recurrence.categoryId
          },
          include: {
            bank: {
              select: {
                id: true,
                name: true,
                shortName: true,
                color: true,
                balance: true
              }
            },
            category: {
              select: {
                id: true,
                name: true,
                type: true,
                color: true,
                icon: true
              }
            }
          }
        });
        
        // Calculer la prochaine échéance
        const nextDue = new Date(recurrence.nextDue);
        switch (recurrence.frequency) {
          case 'DAILY':
            nextDue.setDate(nextDue.getDate() + 1);
            break;
          case 'WEEKLY':
            nextDue.setDate(nextDue.getDate() + 7);
            break;
          case 'MONTHLY':
            nextDue.setMonth(nextDue.getMonth() + 1);
            break;
          case 'QUARTERLY':
            nextDue.setMonth(nextDue.getMonth() + 3);
            break;
          case 'YEARLY':
            nextDue.setFullYear(nextDue.getFullYear() + 1);
            break;
        }
        
        // Mettre à jour la récurrence avec la prochaine échéance
        await prisma.recurrence.update({
          where: { id: recurrence.id },
          data: { nextDue }
        });
        
        results.push({
          recurrenceId: recurrence.id,
          transactionId: transaction.id,
          description: recurrence.description,
          amount: recurrence.amount,
          nextDue: nextDue.toISOString(),
          transaction
        });
        
        processedCount++;
        
      } catch (error) {
        console.error(`Error processing recurrence ${recurrence.id}:`, error);
        results.push({
          recurrenceId: recurrence.id,
          error: 'Failed to process recurrence',
          description: recurrence.description
        });
      }
    }
    
    res.json({
      message: `Processed ${processedCount} recurrences`,
      processedCount,
      results
    });
    
  } catch (error) {
    console.error('Error processing recurrences:', error);
    res.status(500).json({ error: 'Failed to process recurrences' });
  }
});

// Routes pour les objectifs d'épargne
// GET /api/objectives - Récupérer tous les objectifs
app.get('/api/objectives', async (req, res) => {
  try {
    const objectives = await prisma.objective.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(objectives);
  } catch (error) {
    console.error('Error fetching objectives:', error);
    res.status(500).json({ error: 'Failed to fetch objectives' });
  }
});

// POST /api/objectives - Créer un nouvel objectif
app.post('/api/objectives', async (req, res) => {
  try {
    const { title, description, targetAmount, deadline } = req.body;
    
    if (!title || !targetAmount) {
      return res.status(400).json({ 
        error: 'Title and targetAmount are required' 
      });
    }
    
    const objective = await prisma.objective.create({
      data: {
        title,
        description: description || null,
        targetAmount: parseFloat(targetAmount),
        deadline: deadline ? new Date(deadline) : null,
        isCompleted: false
      }
    });
    
    res.status(201).json(objective);
  } catch (error) {
    console.error('Error creating objective:', error);
    res.status(500).json({ error: 'Failed to create objective' });
  }
});

// PUT /api/objectives/:id - Mettre à jour un objectif
app.put('/api/objectives/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, targetAmount, deadline, isCompleted } = req.body;
    
    const objective = await prisma.objective.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(targetAmount && { targetAmount: parseFloat(targetAmount) }),
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
        ...(isCompleted !== undefined && { isCompleted })
      }
    });
    
    res.json(objective);
  } catch (error: any) {
    console.error('Error updating objective:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Objective not found' });
    }
    res.status(500).json({ error: 'Failed to update objective' });
  }
});

// DELETE /api/objectives/:id - Supprimer un objectif
app.delete('/api/objectives/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.objective.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting objective:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Objective not found' });
    }
    res.status(500).json({ error: 'Failed to delete objective' });
  }
});

// GET /api/objectives/:id/progress - Obtenir le progrès d'un objectif
app.get('/api/objectives/:id/progress', async (req, res) => {
  try {
    const { id } = req.params;
    
    const objective = await prisma.objective.findUnique({
      where: { id }
    });
    
    if (!objective) {
      return res.status(404).json({ error: 'Objective not found' });
    }
    
    // Rechercher les transactions qui contiennent "Économie [titre]"
    const searchPattern = `Économie ${objective.title}`;
    
    const transactions = await prisma.transaction.findMany({
      where: {
        description: {
          contains: searchPattern
        },
        amount: {
          gt: 0 // Seulement les transactions positives (épargne)
        }
      },
      include: {
        bank: {
          select: {
            id: true,
            name: true,
            shortName: true,
            color: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            icon: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    const totalSaved = transactions.reduce((sum, t) => sum + t.amount, 0);
    const remaining = objective.targetAmount - totalSaved;
    const percentage = objective.targetAmount > 0 ? (totalSaved / objective.targetAmount) * 100 : 0;
    const isCompleted = totalSaved >= objective.targetAmount;
    
    // Mettre à jour automatiquement le statut si l'objectif est atteint
    if (isCompleted && !objective.isCompleted) {
      await prisma.objective.update({
        where: { id },
        data: { isCompleted: true }
      });
    }
    
    res.json({
      objective: {
        ...objective,
        isCompleted: isCompleted
      },
      transactions,
      totalSaved,
      remaining,
      percentage,
      isCompleted,
      searchPattern
    });
  } catch (error) {
    console.error('Error fetching objective progress:', error);
    res.status(500).json({ error: 'Failed to fetch objective progress' });
  }
});

app.get('/api/recurrences', async (req, res) => {
  try {
    const recurrences = await prisma.recurrence.findMany({
      include: {
        bank: true,
        category: true
      },
      orderBy: {
        nextDue: 'asc'
      }
    });
    res.json(recurrences);
  } catch (error) {
    console.error('Error fetching recurrences:', error);
    res.status(500).json({ error: 'Failed to fetch recurrences' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

export default app;
