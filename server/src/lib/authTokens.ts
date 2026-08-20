/**
 * Jetons de session signés.
 *
 * L'API n'a longtemps eu aucune notion d'identité : le client envoyait un
 * `userId` en query et le serveur le croyait. Dès que le tunnel HTTPS est
 * ouvert, cela revient à publier toutes les données. Un jeton signé côté
 * serveur redonne une identité vérifiable à chaque requête.
 *
 * Le secret vit avec la base (FINDY_DATA_DIR), pas dans le bundle : le jeton
 * survit donc au redémarrage de l'application, et une réinstallation propre
 * (nouveau dossier de données) invalide tout.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PERSISTENCE_DIR, ensurePersistenceDir } from './persistence';

const SECRET_PATH = path.join(PERSISTENCE_DIR, 'auth-secret');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

let cachedSecret: Buffer | null = null;

function loadSecret(): Buffer {
  if (cachedSecret) return cachedSecret;

  ensurePersistenceDir();
  try {
    const existing = fs.readFileSync(SECRET_PATH, 'utf-8').trim();
    if (existing.length >= 64) {
      cachedSecret = Buffer.from(existing, 'hex');
      return cachedSecret;
    }
  } catch {
    // Premier démarrage : le secret n'existe pas encore.
  }

  const secret = crypto.randomBytes(48);
  // 0600 : seul le compte utilisateur qui fait tourner l'app peut le lire.
  fs.writeFileSync(SECRET_PATH, secret.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
  cachedSecret = secret;
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', loadSecret()).update(payload).digest('base64url');
}

export interface TokenPayload {
  userId: string;
  expiresAt: number;
}

/** Émet un jeton opaque pour ce profil. */
export function issueToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: Date.now() + TOKEN_TTL_MS }),
  ).toString('base64url');
  return `v1.${payload}.${sign(payload)}`;
}

/** Renvoie le contenu du jeton, ou `null` si signature invalide/expirée. */
export function verifyToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null;

  const [version, payload, signature] = token.split('.');
  if (version !== 'v1' || !payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return null;
  if (!crypto.timingSafeEqual(expected, received)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    const userId = typeof decoded?.u === 'string' ? decoded.u : null;
    const expiresAt = typeof decoded?.e === 'number' ? decoded.e : 0;
    if (!userId || expiresAt < Date.now()) return null;
    return { userId, expiresAt };
  } catch {
    return null;
  }
}

/** Jeton porté par l'en-tête `Authorization: Bearer …`. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
