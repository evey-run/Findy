import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../prisma';
import { seedDefaultCategories } from '../lib/defaultCategories';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PROJECT_ROOT, 'public/uploads');
const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

/** Résout une URL interne sans jamais sortir du dossier d'uploads. */
function uploadedFilePath(assetUrl: string | null | undefined): string | null {
  if (!assetUrl?.startsWith('/uploads/')) return null;
  const relativePath = assetUrl.slice('/uploads/'.length);
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  const resolvedPath = path.resolve(uploadsRoot, relativePath);
  return resolvedPath.startsWith(`${uploadsRoot}${path.sep}`) ? resolvedPath : null;
}

/**
 * Le hash du mot de passe ne doit jamais sortir de l'API : on expose juste
 * `hasPassword`. On aplatit aussi les espaces en `spaces` + `userBanks`
 * (les comptes de tous ses espaces), forme attendue par l'UI existante.
 */
function sanitizeUser<T extends { passwordHash?: string | null; spaceMembers?: any[] }>(user: T) {
  const { passwordHash, spaceMembers, ...rest } = user as any;
  const spaces = (spaceMembers ?? []).map((m: any) => m.space);
  const banks = spaces.flatMap((space: any) => space?.banks ?? []);
  return {
    ...rest,
    hasPassword: !!passwordHash,
    spaces: spaces.map((s: any) => ({ id: s.id, name: s.name, kind: s.kind })),
    userBanks: banks.map((bank: any) => ({ userId: rest.id, bankId: bank.id, bank }))
  };
}

// Configuration multer pour upload d'avatar
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(AVATARS_DIR)) {
      fs.mkdirSync(AVATARS_DIR, { recursive: true });
    }
    cb(null, AVATARS_DIR);
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
        spaceMembers: {
          include: {
            space: { include: { banks: true } }
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    res.json(users.map(sanitizeUser));
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
        spaceMembers: {
          include: {
            space: { include: { banks: true } }
          }
        }
      }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(sanitizeUser(user));
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/users - Create a new user
router.post('/', async (req, res) => {
  try {
    const { name, avatar } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (name.length > 20) {
      return res.status(400).json({ error: 'Name must be 20 characters or less' });
    }

    // Le tout premier membre créé devient automatiquement « Moi ».
    const existingCount = await prisma.user.count();

    const user = await prisma.user.create({
      data: {
        name,
        avatar: avatar || null,
        isMe: existingCount === 0
      },
      include: {
        spaceMembers: {
          include: {
            space: { include: { banks: true } }
          }
        }
      }
    });

    // Compte vierge : le premier profil hérite d'un jeu de catégories par défaut
    // (issue #36). Sans effet si le catalogue commun est déjà peuplé.
    if (existingCount === 0) {
      try {
        await seedDefaultCategories();
      } catch (seedError) {
        // Non bloquant : un profil créé sans catégories reste utilisable.
        console.error('Error seeding default categories:', seedError);
      }
    }

    res.status(201).json(sanitizeUser(user));
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id/set-me - Désigner cet utilisateur comme « Moi » (un seul à la fois)
router.put('/:id/set-me', async (req, res) => {
  try {
    const { id } = req.params;

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Opération atomique : on retire le flag à tous les autres, puis on le pose.
    await prisma.$transaction([
      prisma.user.updateMany({ where: { id: { not: id } }, data: { isMe: false } }),
      prisma.user.update({ where: { id }, data: { isMe: true } })
    ]);

    const users = await prisma.user.findMany({
      include: {
        spaceMembers: {
          include: {
            space: { include: { banks: true } }
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json(users.map(sanitizeUser));
  } catch (error) {
    console.error('Error setting "me" user:', error);
    res.status(500).json({ error: 'Failed to set current user' });
  }
});

// PUT /api/users/:id - Update a user
router.put('/:id', upload.single('avatar'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    // Validation du nom
    if (name && name.length > 20) {
      return res.status(400).json({ error: 'Name must be 20 characters or less' });
    }

    // Préparer les données de mise à jour (email retiré du schéma)
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;

    // Si un nouvel avatar est uploadé
    if (req.file) {
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
      
      // Supprimer l'ancien avatar si il existe
      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { avatar: true }
      });
      
      const oldAvatarPath = uploadedFilePath(existingUser?.avatar);
      if (oldAvatarPath) {
        if (fs.existsSync(oldAvatarPath)) {
          fs.unlinkSync(oldAvatarPath);
        }
      }
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        spaceMembers: {
          include: {
            space: { include: { banks: true } }
          }
        }
      }
    });
    
    res.json(sanitizeUser(user));
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
    
    const avatarPath = uploadedFilePath(existingUser?.avatar);
    if (avatarPath) {
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
