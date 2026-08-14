/**
 * Applique au démarrage les migrations non encore jouées.
 *
 * L'app packagée n'a ni CLI Prisma ni fichiers de migration sur disque : les
 * SQL sont embarqués dans le binaire (cf. scripts/generate-migrations-bundle.mjs).
 * Sans ce passage, une installation neuve démarre sur une base vide et toutes
 * les requêtes échouent — le symptôme visible étant « Serveur injoignable ».
 *
 * On réutilise la table `_prisma_migrations` de Prisma, avec les mêmes colonnes,
 * pour rester compatible avec `prisma migrate status` en développement.
 */
import { randomUUID } from 'node:crypto';
import prisma from '../prisma';
import { MIGRATIONS } from '../generated/migrations';

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                    TEXT PRIMARY KEY NOT NULL,
  "checksum"              TEXT NOT NULL,
  "finished_at"           DATETIME,
  "migration_name"        TEXT NOT NULL,
  "logs"                  TEXT,
  "rolled_back_at"        DATETIME,
  "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
  "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
)`;

/**
 * Découpe un fichier de migration en instructions.
 *
 * Les migrations générées par Prisma pour SQLite terminent chaque instruction
 * par `;` en fin de ligne et ne contiennent pas de littéral chaîne avec un
 * point-virgule — un découpage simple suffit. On retire les commentaires `--`
 * pour ne pas exécuter d'instruction vide.
 */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runPendingMigrations(): Promise<void> {
  await prisma.$executeRawUnsafe(MIGRATIONS_TABLE);

  const applied = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
  );
  const done = new Set(applied.map((r) => r.migration_name));

  const pending = MIGRATIONS.filter((m) => !done.has(m.name));
  if (pending.length === 0) {
    console.log(`[Migrations] Base à jour (${done.size} appliquée(s))`);
    return;
  }

  console.log(`[Migrations] ${pending.length} migration(s) à appliquer`);

  for (const migration of pending) {
    const statements = splitStatements(migration.sql);
    try {
      // Pas de $transaction : certaines migrations SQLite manipulent
      // `PRAGMA foreign_keys`, qui est sans effet à l'intérieur d'une transaction.
      for (const statement of statements) {
        await prisma.$executeRawUnsafe(statement);
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES (?, ?, ?, current_timestamp, current_timestamp, ?)`,
        randomUUID(),
        migration.checksum,
        migration.name,
        statements.length
      );
      console.log(`[Migrations] ✓ ${migration.name}`);
    } catch (err: any) {
      console.error(`[Migrations] ✗ ${migration.name}: ${err.message}`);
      throw err;
    }
  }
}
