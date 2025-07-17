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
      users: bank.userBanks.map(ub => ({
        ...ub.user,
        role: ub.role
      })),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
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
      users: bank.userBanks.map(ub => ({
        ...ub.user,
        role: ub.role
      })),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
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
    const { name, shortName, color, iban, balance, userId } = req.body;
    
    console.log('🔧 Creating bank with data:', { name, shortName, color, iban, balance, userId });
    
    if (!name || !userId) {
      return res.status(400).json({ error: 'Name and userId are required' });
    }
    
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;
    
    const bank = await prisma.bank.create({
      data: {
        name,
        shortName,
        color: color || '#3b82f6',
        image: imageUrl,
        iban,
        balance: parseFloat(balance) || 0,
        userBanks: {
          create: {
            userId: userId,
            role: 'OWNER'
          }
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
      users: bank.userBanks.map(ub => ({
        ...ub.user,
        role: ub.role
      })),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
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
    const { name, shortName, color, iban, balance } = req.body;
    
    const updateData: any = {
      name,
      shortName,
      color,
      iban,
      balance
    };
    
    // Add image if uploaded
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
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
      users: bank.userBanks.map(ub => ({
        ...ub.user,
        role: ub.role
      })),
      sharedUsers: bank.userBanks.filter(ub => ub.role === 'SHARED').map(ub => ub.user)
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
        bankId: id,
        role: 'SHARED'
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
    
    // Check if bank still has any shared users
    const sharedUsers = await prisma.userBank.findMany({
      where: {
        bankId: id,
        role: 'SHARED'
      }
    });
    
    // Update bank shared status
    if (sharedUsers.length === 0) {
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
