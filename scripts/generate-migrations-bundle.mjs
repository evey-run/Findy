#!/usr/bin/env node
/**
 * Embarque les migrations SQL dans une source TypeScript.
 *
 * Le serveur est compilé en binaire autonome par Bun : les fichiers de
 * `prisma/migrations/` ne l'accompagnent pas, et la CLI Prisma n'est pas
 * disponible à l'exécution. Sans ça, une installation neuve démarre sur une
 * base vide et chaque requête échoue.
 *
 * Lancé par scripts/build-server.sh et par `npm run dev:server`.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');
const OUT_FILE = path.join(ROOT, 'server', 'src', 'generated', 'migrations.ts');

const dirs = fs
  .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(MIGRATIONS_DIR, e.name, 'migration.sql')))
  .map((e) => e.name)
  .sort(); // les noms sont horodatés : l'ordre lexicographique est l'ordre d'application

const migrations = dirs.map((name) => {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf-8');
  return { name, checksum: crypto.createHash('sha256').update(sql).digest('hex'), sql };
});

const banner = `// Généré par scripts/generate-migrations-bundle.mjs — ne pas éditer à la main.
// Régénéré à chaque build du serveur ; ${migrations.length} migration(s).

export interface EmbeddedMigration {
  name: string;
  checksum: string;
  sql: string;
}

export const MIGRATIONS: EmbeddedMigration[] = ${JSON.stringify(migrations, null, 2)};
`;

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, banner);
console.log(`==> ${migrations.length} migration(s) embarquée(s) dans ${path.relative(ROOT, OUT_FILE)}`);
