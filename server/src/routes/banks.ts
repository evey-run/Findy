import express from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { memoryUpload, storeUploadedImage, deleteStoredImage } from '../lib/uploads';
import { validate } from '../middlewares/validate';
import { IdParam } from '../schemas/common';
import { ListBanksQuery } from '../schemas/banks';

const router = express.Router();

function extractUserIds(body: Record<string, unknown>): string[] {
  if (Array.isArray(body.userIds)) return body.userIds.filter((u): u is string => typeof u === 'string');
  const out: string[] = [];
  for (const key of Object.keys(body)) {
    if (key.startsWith('userIds[') && typeof body[key] === 'string') {
      out.push(body[key] as string);
    }
  }
  return out;
}

// GET /api/banks - Get all banks (optionally filtered by user)
router.get('/', validate({ query: ListBanksQuery }), async (req, res) => {
  try {
    const { userId, archived } = req.query as { userId?: string; archived?: boolean };

    const whereClause: { userBanks?: { some: { userId: string } }; archived?: boolean } = {};
    if (userId) whereClause.userBanks = { some: { userId } };
    if (archived !== undefined) whereClause.archived = archived;
    
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
    logger.error({ err: error }, 'Error fetching banks');
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// GET /api/banks/:id - Get a specific bank
router.get('/:id', validate({ params: IdParam }), async (req, res) => {
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
    logger.error({ err: error }, 'Error fetching bank');
    res.status(500).json({ error: 'Failed to fetch bank' });
  }
});

// POST /api/banks - Create a new bank
router.post('/', memoryUpload.single('image'), async (req, res) => {
  try {
    const { name, shortName, color, iban, balance, createdAt, accountType } = req.body;

    // Récupérer les userIds — multer peut les exposer soit comme array `userIds: [...]`
    // soit comme clés indexées `userIds[0]`, `userIds[1]`, etc. selon la version.
    const userIds: string[] = extractUserIds(req.body);

    if (!name || userIds.length === 0) {
      return res.status(400).json({ error: 'Name and at least one user are required' });
    }

    let imageUrl: string | null = null;
    if (req.file) {
      const stored = await storeUploadedImage(req.file, { prefix: 'bank' });
      if (!stored.ok) return res.status(stored.status).json({ error: stored.error });
      imageUrl = stored.publicUrl;
    }
    
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
        accountType: accountType || 'CURRENT',
        createdAt: createdAtDate,
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
    
    logger.info({ bankId: transformedBank.id }, 'Bank created');
    res.status(201).json(transformedBank);
  } catch (error) {
    logger.error({ err: error }, 'Error creating bank');
    res.status(500).json({ error: 'Failed to create bank' });
  }
});

// PUT /api/banks/:id - Update a bank
router.put('/:id', memoryUpload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    let { name, shortName, color, iban, balance, createdAt, accountType, data } = req.body;

    // Vérifier si les données sont envoyées dans le champ 'data' (format JSON)
    let userIds: string[] = [];

    // Extraire les données du formulaire
    if (data) {
      try {
        const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
        userIds = Array.isArray(parsedData.userIds) ? parsedData.userIds : [];
        name = parsedData.name || name;
        shortName = parsedData.shortName || shortName;
        color = parsedData.color || color;
        iban = parsedData.iban || iban;
        balance = parsedData.balance !== undefined ? parseFloat(parsedData.balance) : balance;
        accountType = parsedData.accountType !== undefined ? parsedData.accountType : (accountType || 'CURRENT');
        createdAt = parsedData.createdAt || createdAt;
      } catch (error) {
        logger.error({ err: error }, 'Error parsing bank update data field');
      }
    } else {
      userIds = extractUserIds(req.body);
    }
    
    const updateData: any = {
      name,
      shortName,
      color,
      iban,
      balance: parseFloat(balance),
      accountType: accountType // Utiliser directement accountType sans fallback ici
    };
    
    // Si createdAt est fourni, l'utiliser
    if (createdAt) {
      updateData.createdAt = new Date(createdAt);
    }
    
    // Add image if uploaded
    if (req.file) {
      const stored = await storeUploadedImage(req.file, { prefix: 'bank' });
      if (!stored.ok) return res.status(stored.status).json({ error: stored.error });
      // Supprimer l'ancienne image si présente
      const previous = await prisma.bank.findUnique({ where: { id }, select: { image: true } });
      await deleteStoredImage(previous?.image ?? null);
      updateData.image = stored.publicUrl;
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
    logger.error({ err: error }, 'Error updating bank');
    res.status(500).json({ error: 'Failed to update bank' });
  }
});

// PUT /api/banks/:id/restore - Restore an archived bank
router.put('/:id/restore', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    
    const bank = await prisma.bank.update({
      where: { id },
      data: { archived: false },
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
    logger.error({ err: error }, 'Error restoring bank');
    res.status(500).json({ error: 'Failed to restore bank' });
  }
});

// DELETE /api/banks/:id/permanent - Permanently delete an archived bank and all associated data
router.delete('/:id/permanent', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    
    // First, get the bank name for the response
    const bank = await prisma.bank.findUnique({
      where: { id },
      select: { name: true }
    });
    
    if (!bank) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    // Count transactions before deletion for the response
    const transactionCount = await prisma.transaction.count({
      where: { bankId: id }
    });
    
    // Use a transaction to ensure all deletions succeed or fail together
    await prisma.$transaction(async (tx) => {
      // Delete all transactions associated with this bank
      await tx.transaction.deleteMany({
        where: { bankId: id }
      });
      
      // Delete all budgets associated with categories that might reference this bank
      await tx.budget.deleteMany({
        where: { bankId: id }
      });
      
      // Delete all recurrences associated with this bank
      await tx.recurrence.deleteMany({
        where: { bankId: id }
      });
      
      // Delete user-bank relationships
      await tx.userBank.deleteMany({
        where: { bankId: id }
      });
      
      // Finally, delete the bank itself
      await tx.bank.delete({
        where: { id }
      });
    });
    
    res.json({
      message: 'Bank permanently deleted',
      bankName: bank.name,
      deletedTransactions: transactionCount
    });
  } catch (error) {
    logger.error({ err: error }, 'Error permanently deleting bank');
    res.status(500).json({ error: 'Failed to permanently delete bank' });
  }
});

// DELETE /api/banks/:id - Delete a bank (archive it)
router.delete('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Archive the bank instead of deleting it
    await prisma.bank.update({
      where: { id },
      data: { archived: true }
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Error archiving bank');
    res.status(500).json({ error: 'Failed to archive bank' });
  }
});

export default router;
