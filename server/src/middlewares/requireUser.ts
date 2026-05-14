import type { Request, Response, NextFunction } from 'express';
import { getSessionUser, SESSION_COOKIE_NAME } from '../lib/auth';

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  const user = await getSessionUser(sessionId);
  if (!user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.user = user;
  next();
}

export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  const user = await getSessionUser(sessionId);
  if (user) req.user = user;
  next();
}
