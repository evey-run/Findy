import express from 'express';
import { prisma } from '../lib/prisma';
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from '../lib/auth';
import { requireUser } from '../middlewares/requireUser';
import { validate } from '../middlewares/validate';
import { RegisterBody, LoginBody } from '../schemas/auth';

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_DURATION_MS,
  path: '/',
};

// GET /api/auth/status - Indique si l'inscription est encore ouverte
router.get('/status', async (_req, res) => {
  const count = await prisma.user.count({ where: { passwordHash: { not: null } } });
  res.json({ signupOpen: count === 0 });
});

// POST /api/auth/register - Crée le 1er compte (puis se ferme)
router.post('/register', validate({ body: RegisterBody }), async (req, res) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };

  // L'inscription n'est ouverte que tant qu'aucun compte avec mot de passe n'existe
  const existingCount = await prisma.user.count({ where: { passwordHash: { not: null } } });
  if (existingCount > 0) {
    return res.status(403).json({ error: 'Registration is closed' });
  }

  const collision = await prisma.user.findUnique({ where: { email } });
  if (collision) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
    select: { id: true, name: true, email: true, avatar: true },
  });

  // Premier compte : récupérer toutes les banks non encore associées à un user
  // afin que l'historique existant soit accessible immédiatement.
  const orphanBanks = await prisma.bank.findMany({
    where: { userBanks: { none: {} } },
    select: { id: true },
  });
  if (orphanBanks.length > 0) {
    await prisma.userBank.createMany({
      data: orphanBanks.map((b) => ({ userId: user.id, bankId: b.id })),
    });
  }

  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE_NAME, session.id, COOKIE_OPTS);
  res.status(201).json({ user });
});

// POST /api/auth/login
router.post('/login', validate({ body: LoginBody }), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const session = await createSession(user.id);
  res.cookie(SESSION_COOKIE_NAME, session.id, COOKIE_OPTS);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
  });
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  await destroySession(sessionId);
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.status(204).send();
});

// GET /api/auth/me - Récupère l'utilisateur courant
router.get('/me', requireUser, async (req, res) => {
  res.json({ user: req.user });
});

export default router;
