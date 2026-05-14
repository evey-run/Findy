---
name: api-route
description: Créer une nouvelle route Express + Prisma pour une ressource (CRUD complet)
---

# API Route Creator

## Localisation

`server/src/routes/<resource>.ts`

## Template CRUD

```ts
import express from 'express';
import { prisma } from '../lib/prisma';

const router = express.Router();

// GET /api/<resource> — Liste
router.get('/', async (req, res) => {
  try {
    const { search, limit, offset } = req.query;
    const where: any = {};
    if (search && typeof search === 'string' && search.trim() !== '') {
      where.name = { contains: search.trim() };
    }
    const items = await prisma.myModel.findMany({
      where,
      take: limit ? Number(limit) : undefined,
      skip: offset ? Number(offset) : undefined,
      orderBy: { createdAt: 'desc' },
    });
    res.json(items);
  } catch (err) {
    console.error('GET /<resource> error', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/<resource>/:id — Détail
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.myModel.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: 'Introuvable' });
    res.json(item);
  } catch (err) {
    console.error('GET /<resource>/:id error', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/<resource> — Création
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.name) return res.status(400).json({ error: 'name requis' });
    const item = await prisma.myModel.create({ data });
    res.status(201).json(item);
  } catch (err) {
    console.error('POST /<resource> error', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/<resource>/:id — Mise à jour
router.put('/:id', async (req, res) => {
  try {
    const item = await prisma.myModel.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json(item);
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Introuvable' });
    console.error('PUT /<resource>/:id error', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/<resource>/:id — Suppression
router.delete('/:id', async (req, res) => {
  try {
    await prisma.myModel.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Introuvable' });
    console.error('DELETE /<resource>/:id error', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
```

## Enregistrement

Dans `server/src/index.ts` :

```ts
import myResourceRouter from './routes/<resource>';
app.use('/api/<resource>', myResourceRouter);
```

## Checklist

1. [ ] Créer le fichier `server/src/routes/<resource>.ts`
2. [ ] Importer `prisma` depuis `../lib/prisma`
3. [ ] Implémenter les 5 handlers (list, get, create, update, delete)
4. [ ] Gérer les codes Prisma (`P2025` = not found)
5. [ ] Enregistrer dans `server/src/index.ts`
6. [ ] Ajouter une méthode `loadX` correspondante dans `src/store/index.ts`
7. [ ] Tester via `curl` ou directement via l'UI

## Tests manuels

```bash
curl http://localhost:3001/api/<resource>
curl -X POST http://localhost:3001/api/<resource> -H "Content-Type: application/json" -d '{"name":"Test"}'
curl -X PUT http://localhost:3001/api/<resource>/<id> -H "Content-Type: application/json" -d '{"name":"Updated"}'
curl -X DELETE http://localhost:3001/api/<resource>/<id>
```
