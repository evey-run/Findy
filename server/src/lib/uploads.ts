import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from './logger';

// 5 MB max
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

// Whitelist serveur : on contrôle le mime via magic-byte, pas via l'extension cliente.
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

// On stocke en mémoire pour pouvoir sniffer les magic bytes avant de toucher le disque.
export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

export interface StoreResult {
  ok: true;
  publicUrl: string;
  diskPath: string;
  mime: string;
}
export interface StoreError {
  ok: false;
  status: number;
  error: string;
}

/**
 * Valide le buffer (magic bytes) puis l'écrit dans /public/uploads/<subdir>/.
 * Aucune confiance dans le nom de fichier ou le mime envoyés par le client.
 */
export async function storeUploadedImage(
  file: Express.Multer.File | undefined,
  options: { subdir?: string; prefix: string },
): Promise<StoreResult | StoreError> {
  if (!file) {
    return { ok: false, status: 400, error: 'No file provided' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, status: 413, error: 'File too large' };
  }

  // Magic-byte sniff — la vraie défense contre le MIME spoofing.
  const sniffed = await fileTypeFromBuffer(file.buffer);
  if (!sniffed || !ALLOWED_MIME.has(sniffed.mime)) {
    return { ok: false, status: 415, error: 'Unsupported image format' };
  }

  const ext = MIME_TO_EXT[sniffed.mime];
  const filename = `${options.prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const baseDir = path.join(process.cwd(), 'public/uploads', options.subdir ?? '');
  await fs.promises.mkdir(baseDir, { recursive: true });

  const diskPath = path.join(baseDir, filename);
  await fs.promises.writeFile(diskPath, file.buffer);

  const publicUrl = options.subdir
    ? `/uploads/${options.subdir}/${filename}`
    : `/uploads/${filename}`;

  logger.info({ publicUrl, mime: sniffed.mime, bytes: file.size }, 'Image uploaded');

  return { ok: true, publicUrl, diskPath, mime: sniffed.mime };
}

/**
 * Supprime une image stockée si elle correspond bien à une URL /uploads/...
 * (refuse les path traversal hors public/uploads).
 */
export async function deleteStoredImage(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl) return;
  const uploadsRoot = path.resolve(path.join(process.cwd(), 'public/uploads'));
  const candidate = path.resolve(path.join(process.cwd(), 'public', publicUrl));
  if (!candidate.startsWith(uploadsRoot + path.sep)) {
    logger.warn({ publicUrl }, 'Refused to delete: path outside uploads dir');
    return;
  }
  try {
    await fs.promises.unlink(candidate);
  } catch {
    // fichier déjà absent, ignore
  }
}
