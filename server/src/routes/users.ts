import express from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const prisma = new PrismaClient();
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Configuration multer pour upload d'avatar
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsDir = path.join(PROJECT_ROOT, 'public/uploads/avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'avatar-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

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
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/users/:id - Get a specific user
router.get('/:id', async (req, res) => {
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
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/users - Create a new user
router.post('/', async (req, res) => {
  try {
    const { name, email, avatar } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    if (name.length > 20) {
      return res.status(400).json({ error: 'Name must be 20 characters or less' });
    }
    
    const user = await prisma.user.create({
      data: {
        name,
        email,
        avatar
      },
      include: {
        banks: true
      }
    });
    
    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id - Update a user
router.put('/:id', upload.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    
    // Validation du nom
    if (name && name.length > 20) {
      return res.status(400).json({ error: 'Name must be 20 characters or less' });
    }
    
    // Préparer les données de mise à jour
    const updateData: any = {
      name,
      email: email || null
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
        const oldAvatarPath = path.join(PROJECT_ROOT, 'public', existingUser.avatar);
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
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

// DELETE /api/users/:id - Delete a user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Supprimer l'avatar si il existe
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { avatar: true }
    });
    
    if (existingUser?.avatar) {
      const avatarPath = path.join(PROJECT_ROOT, 'public', existingUser.avatar);
      if (fs.existsSync(avatarPath)) {
        fs.unlinkSync(avatarPath);
      }
    }
    
    await prisma.user.delete({
      where: { id }
    });
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
