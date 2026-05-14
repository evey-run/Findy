---
description: Prisma schema & migration conventions
globs: "prisma/**,server/src/lib/prisma.ts"
---

# Prisma Conventions

## Fichier

`prisma/schema.prisma` — datasource SQLite (`file:./dev.db`).

## Conventions de modèles

- **ID** : `id String @id @default(cuid())`
- **Timestamps** : toujours `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`
- **Mapping table** : `@@map("snake_case_name")` (ex: `@@map("user_banks")`)
- **Champs en camelCase** côté Prisma, snake_case en DB via `@map("...")` si besoin

## Foreign keys

- Préciser systématiquement la stratégie `onDelete` :
  - `Cascade` pour les ressources possédées (suppression du parent = suppression des enfants)
  - Pas de référence par défaut = `SetNull` implicite côté Prisma — préférer l'explicite
- Exemple : `bank Bank @relation(fields: [bankId], references: [id], onDelete: Cascade)`

## Tables de jointure

- Modèle dédié (ex: `UserBank`) avec `@@unique([userId, bankId])` pour éviter les doublons.

## Workflow migration

1. Modifier `prisma/schema.prisma`
2. `npm run db:migrate` — crée la migration et l'applique en local
3. `npm run db:generate` (auto-déclenché par migrate) — régénère le client typé
4. Mettre à jour `prisma/seed.ts` si la nouvelle table doit être seedée
5. Mettre à jour les types TypeScript côté front (`src/types/index.ts`) si nécessaire

## Anti-patterns

- ❌ Ne pas éditer manuellement les fichiers dans `prisma/migrations/`
- ❌ Ne pas dupliquer la définition du client Prisma — toujours `import { prisma } from '../lib/prisma'`
- ❌ Ne pas utiliser `prisma db push` en dev (perd l'historique des migrations)

## Commandes

- `npm run db:migrate` — crée + applique une migration
- `npm run db:generate` — régénère le client
- `npm run db:studio` — UI pour inspecter la base
- `npm run db:seed` — exécute `prisma/seed.ts`
