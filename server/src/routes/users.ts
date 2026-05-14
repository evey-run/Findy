import express from 'express';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { memoryUpload, storeUploadedImage, deleteStoredImage } from '../lib/uploads';
import { validate } from '../middlewares/validate';
import { IdParam } from '../schemas/common';
import { CreateUserBody, UpdateUserBody } from '../schemas/users';
import type { z } from 'zod';

const router = express.Router();

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        userBanks: {
          include: {
            bank: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    res.json(users);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/:id - Get a specific user
router.get('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        userBanks: {
          include: {
            bank: true
          }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching user');
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/users - Create a new user
router.post('/', validate({ body: CreateUserBody }), async (req, res) => {
  try {
    const { name, avatar } = req.body as z.infer<typeof CreateUserBody>;

    const user = await prisma.user.create({
      data: {
        name,
        avatar: avatar ?? null,
      },
      include: {
        userBanks: {
          include: { bank: true },
        },
      },
    });

    res.status(201).json(user);
  } catch (error) {
    logger.error({ err: error }, 'Error creating user');
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id - Update a user (multipart: name + optional avatar file)
router.put(
  '/:id',
  validate({ params: IdParam }),
  memoryUpload.single('avatar'),
  validate({ body: UpdateUserBody }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body as z.infer<typeof UpdateUserBody>;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;

    // Si un nouvel avatar est uploadé
    if (req.file) {
      const stored = await storeUploadedImage(req.file, { subdir: 'avatars', prefix: 'avatar' });
      if (!stored.ok) return res.status(stored.status).json({ error: stored.error });

      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { avatar: true },
      });
      await deleteStoredImage(existingUser?.avatar ?? null);
      updateData.avatar = stored.publicUrl;
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
    logger.error({ err: error }, 'Error updating user');
    res.status(500).json({ error: 'Failed to update user' });
  }
  },
);

// DELETE /api/users/:id - Delete a user
router.delete('/:id', validate({ params: IdParam }), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Supprimer l'avatar si il existe
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { avatar: true },
    });
    await deleteStoredImage(existingUser?.avatar ?? null);

    await prisma.user.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user');
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
