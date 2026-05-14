---
description: Express API backend conventions
globs: "server/src/**"
---

# API Express Conventions

## Structure

- Routes : `server/src/routes/<resource>.ts` (ex: `transactions.ts`, `banks.ts`, `categories.ts`)
- Chaque fichier exporte un `express.Router()` enregistré dans `server/src/index.ts`
- Prisma client unique partagé : `import { prisma } from '../lib/prisma'`

## Patterns CRUD

- Toujours wrapper la handler dans un `try/catch` et renvoyer un statut HTTP cohérent :
  - `200` lecture / mise à jour
  - `201` création
  - `204` suppression
  - `400` input invalide
  - `404` ressource introuvable
  - `500` erreur serveur (logger l'erreur côté serveur)

```ts
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.name) return res.status(400).json({ error: 'name requis' });
    const item = await prisma.bank.create({ data });
    res.status(201).json(item);
  } catch (err) {
    console.error('POST /banks error', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});
```

## Filtres & Query Params

- Lire les filtres via `req.query`, construire un objet `where: any = {}` progressivement.
- Convertir explicitement les booléens (`shared === 'true'`) et les dates (`new Date(...)`).
- Pour la recherche texte, utiliser `contains` Prisma + version normalisée (sans accents) lorsqu'il faut matcher des descriptions FR.

## Includes Prisma

- Inclure systématiquement les relations utiles à l'UI dans la même requête (ex: `bank` + `category` sur les transactions) plutôt que de faire des roundtrips.
- Sélectionner explicitement les champs (`select: { id: true, name: true, ... }`) pour éviter d'exposer des données sensibles ou inutiles.

## Logs

- Pas de `console.log` bavard en prod. Préfixer les logs de debug par un emoji explicite (🔍 recherche, ⚠️ warning, ❌ erreur) et les commenter ou les retirer avant commit.

## Enregistrement d'une route

Dans `server/src/index.ts` :

```ts
import banksRouter from './routes/banks';
app.use('/api/banks', banksRouter);
```

## Commandes

- `npm run dev:server` — démarre le serveur Express avec hot-reload (tsx watch)
- `npm run dev` — frontend + backend en parallèle
- `npm run db:migrate` — applique les migrations Prisma
- `npm run db:generate` — régénère le client Prisma
- `npm run db:studio` — ouvre Prisma Studio
