/**
 * Authentification des requêtes API.
 *
 * `attachAuth` résout l'identité pour toutes les requêtes ; `requireAuth`
 * refuse celles qui n'en ont pas. Les routes lisent ensuite `req.authUserId`
 * plutôt que le `userId` envoyé par le client, qui n'est qu'une préférence
 * d'affichage et non une preuve.
 */
import type { NextFunction, Request, Response } from 'express';
import { bearerToken, verifyToken } from '../lib/authTokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUserId?: string;
    }
  }
}

/** Chemins accessibles sans jeton : ils servent justement à en obtenir un. */
const ANONYMOUS_PATHS = new Set([
  '/api/health',
  '/api/auth/profiles',
  '/api/auth/login',
  '/api/auth/register',
  // Le retour bancaire est un navigateur externe : il s'authentifie par le
  // `state` anti-CSRF de la session OAuth, pas par un jeton applicatif.
  '/api/enablebanking/callback',
  '/api/enablebanking/select-account',
]);

function normalize(path: string): string {
  return path.split('?')[0].replace(/\/+$/, '') || '/';
}

export function isAnonymousPath(path: string): boolean {
  const clean = normalize(path);
  // Les avatars et logos sont chargés par des balises <img>, qui ne peuvent
  // pas porter d'en-tête. Ils restent servis en local uniquement (le tunnel
  // les bloque déjà).
  if (clean.startsWith('/uploads')) return true;
  return ANONYMOUS_PATHS.has(clean);
}

export function attachAuth(req: Request, _res: Response, next: NextFunction): void {
  const payload = verifyToken(bearerToken(req.headers.authorization));
  if (payload) req.authUserId = payload.userId;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.authUserId || isAnonymousPath(req.path)) return next();
  res.status(401).json({ error: 'Session expirée ou absente.' });
}
