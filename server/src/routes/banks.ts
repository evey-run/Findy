import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const prisma = new PrismaClient();

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

// GET /api/banks - Get all banks (optionally filtered by user)
router.get('/', async (req, res) => {
  try {
    const { userId, archived } = req.query;
    
    // Construire le filtre where
    let whereClause: any = {};
    
    // Filtre par utilisateur si spécifié
    if (userId) {
      whereClause.userBanks = {
        some: {
          userId: userId as string
        }
      };
    }
    
    // Filtre par statut archivé
    if (archived !== undefined) {
      whereClause.archived = archived === 'true';
    }
    
    const banks = await prisma.bank.findMany({
      where: whereClause,
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Transform the data to match the expected format
    const transformedBanks = banks.map(bank => ({
      ...bank,
      users: bank.userBanks.map(ub => ub.user)
    }));
    
    res.json(transformedBanks);
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// GET /api/banks/:id - Get a specific bank
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const bank = await prisma.bank.findUnique({
      where: { id },
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
    
    if (!bank) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    // Transform the data to match the expected format
    const transformedBank = {
      ...bank,
      users: bank.userBanks.map(ub => ub.user)
    };
    
    res.json(transformedBank);
  } catch (error) {
    console.error('Error fetching bank:', error);
    res.status(500).json({ error: 'Failed to fetch bank' });
  }
});

// POST /api/banks - Create a new bank
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, shortName, color, iban, balance, createdAt } = req.body;
    
    // Récupérer les userIds du FormData
    const userIds: string[] = [];
    for (const key in req.body) {
      if (key.startsWith('userIds[')) {
        userIds.push(req.body[key]);
      }
    }
    
    console.log('🔧 Creating bank with data:', { name, shortName, color, iban, balance, userIds, createdAt });
    
    if (!name || userIds.length === 0) {
      return res.status(400).json({ error: 'Name and at least one user are required' });
    }
    
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    // Si createdAt est fourni, l'utiliser, sinon utiliser la date actuelle
    const createdAtDate = createdAt ? new Date(createdAt) : new Date();
    
    const bank = await prisma.bank.create({
      data: {
        name,
        shortName,
        color: color || '#3b82f6',
        image: imageUrl,
        iban,
        balance: parseFloat(balance) || 0,
        createdAt: createdAtDate,
        isShared: userIds.length > 1, // Marquer comme partagé si plusieurs utilisateurs
        userBanks: {
          create: userIds.map((userId: string) => ({
            userId: userId
          }))
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
    
    // Transform the data to match the expected format
    const transformedBank = {
      ...bank,
      users: bank.userBanks.map(ub => ub.user)
    };
    
    console.log('🔧 Bank created successfully:', transformedBank.name);
    res.status(201).json(transformedBank);
  } catch (error) {
    console.error('🔧 Error creating bank:', error);
    res.status(500).json({ error: 'Failed to create bank', details: error.message });
  }
});

// PUT /api/banks/:id - Update a bank
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, shortName, color, iban, balance, createdAt } = req.body;
    
    // Récupérer les userIds du FormData pour la mise à jour
    const userIds: string[] = [];
    for (const key in req.body) {
      if (key.startsWith('userIds[')) {
        userIds.push(req.body[key]);
      }
    }
    
    const updateData: any = {
      name,
      shortName,
      color,
      iban,
      balance
    };
    
    // Si createdAt est fourni, l'utiliser
    if (createdAt) {
      updateData.createdAt = new Date(createdAt);
    }
    
    // Add image if uploaded
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }
    
    // Mettre à jour le statut partagé en fonction du nombre d'utilisateurs
    if (userIds.length > 0) {
      updateData.isShared = userIds.length > 1;
    }
    
    // Si des userIds sont fournis, mettre à jour les relations utilisateur-banque
    if (userIds.length > 0) {
      // Supprimer toutes les relations existantes
      await prisma.userBank.deleteMany({
        where: { bankId: id }
      });
      
      // Créer les nouvelles relations
      await prisma.userBank.createMany({
        data: userIds.map((userId) => ({
          userId,
          bankId: id
        }))
      });
    }

    const bank = await prisma.bank.update({
      where: { id },
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
    
    // Transform the data to match the expected format
    const transformedBank = {
      ...bank,
      users: bank.userBanks.map(ub => ub.user)
    };
    
    res.json(transformedBank);
  } catch (error) {
    console.error('Error updating bank:', error);
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// DELETE /api/banks/:id - Delete a bank
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.bank.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting bank:', error);
    res.status(500).json({ error: 'Failed to delete bank' });
  }
});

// POST /api/banks/:id/share - Share a bank with another user
router.post('/:id/share', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Check if user already has access to this bank
    const existingAccess = await prisma.userBank.findUnique({
      where: {
        userId_bankId: {
          userId,
          bankId: id
        }
      }
    });
    
    if (existingAccess) {
      return res.status(400).json({ error: 'User already has access to this bank' });
    }
    
    // Add shared access
    await prisma.userBank.create({
      data: {
        userId,
        bankId: id
      }
    });
    
    // Update bank to mark as shared
    await prisma.bank.update({
      where: { id },
      data: { isShared: true }
    });
    
    res.status(201).json({ message: 'Bank shared successfully' });
  } catch (error) {
    console.error('Error sharing bank:', error);
    res.status(500).json({ error: 'Failed to share bank' });
  }
});

// DELETE /api/banks/:id/share/:userId - Remove shared access
router.delete('/:id/share/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;
    
    await prisma.userBank.delete({
      where: {
        userId_bankId: {
          userId,
          bankId: id
        }
      }
    });
    
    // Check if bank still has multiple users
    const userCount = await prisma.userBank.count({
      where: {
        bankId: id
      }
    });
    
    // Update bank shared status
    if (userCount <= 1) {
      await prisma.bank.update({
        where: { id },
        data: { isShared: false }
      });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error removing shared access:', error);
    res.status(500).json({ error: 'Failed to remove shared access' });
  }
});

export default router;
