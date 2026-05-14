---
description: TypeScript strict rules
globs: "**/*.ts,**/*.tsx"
---

# TypeScript Rules

- ❌ NEVER use `as unknown as`, `as any`, or type casts that bypass TypeScript safety. Fix the actual types instead.
- ❌ NEVER use `eslint-disable` comments to bypass lint rules. Fix the actual code instead.
- Préférer les types Prisma générés (`import type { Bank } from '@prisma/client'`) côté serveur.
- Côté front, les types métier vivent dans `src/types/index.ts` — les garder synchronisés avec le schema Prisma.
- Imports : pas d'extension (`.ts` / `.tsx`) — Vite + tsx résolvent automatiquement.
- Préférer les `interface` pour les props de composants, les `type` pour les unions / utilitaires.
- Utiliser `unknown` plutôt que `any` quand le type est inconnu, puis narrow avec un guard.
