---
name: prisma-model
description: Ajouter un nouveau modèle Prisma (table + relations + migration)
---

# Prisma Model Creator

## Fichier

`prisma/schema.prisma`

## Template

```prisma
model MyModel {
  id          String   @id @default(cuid())
  name        String
  description String?
  amount      Float    @default(0)
  active      Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Foreign keys
  bankId      String?
  bank        Bank?    @relation(fields: [bankId], references: [id], onDelete: Cascade)

  @@map("my_models")
}
```

## Conventions

- **ID** : `String @id @default(cuid())`
- **Timestamps** : `createdAt` + `updatedAt` obligatoires
- **Mapping table** : `@@map("snake_case_pluriel")`
- **FK** : préciser `onDelete` (`Cascade` pour ressource possédée)
- **Champs optionnels** : suffixer par `?` (ex: `description String?`)

## Relations

Ne pas oublier d'ajouter la relation inverse dans le modèle parent :

```prisma
model Bank {
  // ... champs existants
  myModels MyModel[]
}
```

## Workflow

1. [ ] Éditer `prisma/schema.prisma` (ajout du modèle + relations inverses)
2. [ ] `npm run db:migrate` → demande un nom de migration descriptif (ex: `add_my_models_table`)
3. [ ] Vérifier que la migration générée dans `prisma/migrations/` est correcte
4. [ ] Mettre à jour `src/types/index.ts` avec le nouveau type côté front
5. [ ] (Optionnel) Ajouter un seed dans `prisma/seed.ts` si la table doit être pré-remplie
6. [ ] Créer la route API correspondante via le skill `api-route`
7. [ ] Étendre `src/store/index.ts` avec les setters / loaders

## Vérification

```bash
npm run db:studio   # Ouvre Prisma Studio pour inspecter visuellement
```

## Anti-patterns

- ❌ Pas de `prisma db push` — toujours `prisma migrate dev`
- ❌ Pas d'édition manuelle des SQL dans `prisma/migrations/`
- ❌ Pas d'oubli de la relation inverse côté parent (sinon `findMany({ include: ... })` échouera)
