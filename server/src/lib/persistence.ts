import fs from 'node:fs';
import path from 'node:path';

/**
 * Fichiers persistants hors du bundle de l'application.
 *
 * En développement, le répertoire `data/` du projet reste le fallback. Dans
 * l'application Tauri, Rust fournit FINDY_DATA_DIR et pointe vers
 * ~/Library/Application Support/com.evey.finance, seul emplacement où il est
 * sûr d'écrire après l'installation dans /Applications.
 */
const configuredDataDir = process.env.FINDY_DATA_DIR?.trim();
export const PERSISTENCE_DIR = configuredDataDir || path.resolve(process.cwd(), 'data');

export const SYNC_SETTINGS_PATH = path.join(PERSISTENCE_DIR, 'sync-settings.json');

export function ensurePersistenceDir(): void {
  fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
}
