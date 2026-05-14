import argon2 from 'argon2';
import crypto from 'crypto';
import { prisma } from './prisma';

export const SESSION_COOKIE_NAME = 'finance_session';
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30; // 30 jours

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

export async function createSession(userId: string) {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({ data: { id, userId, expiresAt } });
  return { id, expiresAt };
}

export async function getSessionUser(sessionId: string | undefined) {
  if (!sessionId) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
    return null;
  }
  return session.user;
}

export async function destroySession(sessionId: string | undefined) {
  if (!sessionId) return;
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
}

export async function purgeExpiredSessions() {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
