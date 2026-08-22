import express from 'express';
import crypto from 'crypto';
import prisma from '../prisma';
import { issueToken } from '../lib/authTokens';
import { seedDefaultCategories } from '../lib/defaultCategories';

const router = express.Router();

// ─── Hachage du mot de passe (scrypt, pas de dépendance externe) ───
// Format stocké : "scrypt:<salt hex>:<hash hex>"

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  // timingSafeEqual exige des longueurs identiques
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

const userInclude = { spaceMembers: { include: { space: true } } } as const;

/** Retire le hash et aplatit les espaces avant d'envoyer l'utilisateur au client. */
function sanitize<T extends { passwordHash?: string | null; spaceMembers?: any[] }>(user: T) {
  const { passwordHash, spaceMembers, ...rest } = user as any;
  return {
    ...rest,
    hasPassword: !!passwordHash,
    spaces: (spaceMembers ?? []).map((m: any) => m.space)
  };
}

// GET /api/auth/profiles — liste des profils affichés sur l'écran de connexion
router.get('/profiles', async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, avatar: true, isMe: true, passwordHash: true },
      orderBy: { createdAt: 'asc' }
    });
    res.json(users.map(sanitize));
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// GET /api/auth/session — rehydrate la session à partir du jeton porté par la
// requête. L'ancienne version prenait l'id du profil dans l'URL : n'importe qui
// pouvait donc « restaurer » la session de n'importe quel profil.
router.get('/session', async (req, res) => {
  try {
    if (!req.authUserId) return res.status(401).json({ error: 'Session expirée ou absente.' });
    const user = await prisma.user.findUnique({ where: { id: req.authUserId }, include: userInclude });
    if (!user) return res.status(404).json({ error: 'Profil introuvable' });
    res.json(sanitize(user));
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /api/auth/login { userId, password? }
// Le profil connecté devient le « Moi » de l'app : toutes les données (banques,
// dettes, dashboard) sont donc rattachées à l'utilisateur connecté.
router.post('/login', async (req, res) => {
  try {
    const { userId, password } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Profil introuvable' });

    if (user.passwordHash) {
      if (!password) return res.status(401).json({ error: 'Mot de passe requis', passwordRequired: true });
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }
    }

    // Le profil connecté devient « Moi » (un seul à la fois).
    await prisma.$transaction([
      prisma.user.updateMany({ where: { id: { not: user.id } }, data: { isMe: false } }),
      prisma.user.update({ where: { id: user.id }, data: { isMe: true } })
    ]);

    const fresh = await prisma.user.findUnique({ where: { id: user.id }, include: userInclude });
    res.json({ ...sanitize(fresh!), token: issueToken(user.id) });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// POST /api/auth/register { name, avatar?, password? }
// Créer un profil = créer un utilisateur : c'est exactement le même objet que
// les membres ajoutés depuis le Portefeuille. Le mot de passe reste optionnel.
router.post('/register', async (req, res) => {
  try {
    const { name, avatar, password } = req.body ?? {};

    if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom est requis' });
    if (name.length > 20) return res.status(400).json({ error: 'Le nom doit faire 20 caractères maximum' });
    if (password && password.length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 4 caractères' });
    }

    const existing = await prisma.user.findFirst({ where: { name: name.trim() } });
    if (existing) return res.status(409).json({ error: 'Ce nom est déjà utilisé' });

    const isFirst = (await prisma.user.count()) === 0;

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        avatar: avatar || null,
        passwordHash: password ? hashPassword(password) : null,
        isMe: isFirst
      },
      include: userInclude
    });

    // On connecte directement le nouveau profil.
    await prisma.$transaction([
      prisma.user.updateMany({ where: { id: { not: user.id } }, data: { isMe: false } }),
      prisma.user.update({ where: { id: user.id }, data: { isMe: true } })
    ]);

    // Compte vierge : le premier profil hérite d'un jeu de catégories par défaut
    // (issue #36). Sans effet si le catalogue commun est déjà peuplé.
    if (isFirst) {
      try {
        await seedDefaultCategories();
      } catch (seedError) {
        // Non bloquant : un profil créé sans catégories reste utilisable.
        console.error('Error seeding default categories:', seedError);
      }
    }

    const fresh = await prisma.user.findUnique({ where: { id: user.id }, include: userInclude });
    res.status(201).json({ ...sanitize(fresh!), token: issueToken(user.id) });
  } catch (error) {
    console.error('Error during register:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// PUT /api/auth/password { userId, currentPassword?, newPassword? }
// newPassword vide/null => on retire la protection du profil.
router.put('/password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body ?? {};
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    // Un profil sans mot de passe ne doit pas pouvoir être « verrouillé » par
    // quelqu'un d'autre : on ne modifie que le profil connecté.
    if (req.authUserId !== userId) {
      return res.status(403).json({ error: 'Vous ne pouvez modifier que votre propre mot de passe.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Profil introuvable' });

    // Si le profil est déjà protégé, il faut prouver qu'on le connaît.
    if (user.passwordHash) {
      if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
        return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
      }
    }

    if (newPassword && newPassword.length < 4) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 4 caractères' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPassword ? hashPassword(newPassword) : null },
      include: userInclude
    });

    res.json(sanitize(updated));
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

export default router;
