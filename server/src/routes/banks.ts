import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/banks - Get all banks (optionally filtered by user)
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    
    const banks = await prisma.bank.findMany({
      where: userId ? { userId: userId as string } : {},
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(banks);
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
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    if (!bank) {
      return res.status(404).json({ error: 'Bank not found' });
    }
    
    res.json(bank);
  } catch (error) {
    console.error('Error fetching bank:', error);
    res.status(500).json({ error: 'Failed to fetch bank' });
  }
});

// POST /api/banks - Create a new bank
router.post('/', async (req, res) => {
  try {
    const { name, shortName, color, iban, balance, userId } = req.body;
    
    if (!name || !userId) {
      return res.status(400).json({ error: 'Name and userId are required' });
    }
    
    const bank = await prisma.bank.create({
      data: {
        name,
        shortName,
        color: color || '#3b82f6',
        iban,
        balance: balance || 0,
        userId
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    res.status(201).json(bank);
  } catch (error) {
    console.error('Error creating bank:', error);
    res.status(500).json({ error: 'Failed to create bank' });
  }
});

// PUT /api/banks/:id - Update a bank
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, shortName, color, iban, balance } = req.body;
    
    const bank = await prisma.bank.update({
      where: { id },
      data: {
        name,
        shortName,
        color,
        iban,
        balance
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    res.json(bank);
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

export default router;
