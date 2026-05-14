---
name: store-slice
description: Ajouter un nouveau slice (entité) au store Zustand global avec setters + loaders
---

# Zustand Store Slice

## Fichier

`src/store/index.ts` — store unique étendu, pas de second store.

## Étape 1 — Étendre l'interface AppState

```ts
interface AppState {
  // ... slices existants

  // MyEntity
  myEntities: MyEntity[];
  setMyEntities: (items: MyEntity[]) => void;
  addMyEntity: (item: MyEntity) => void;
  updateMyEntity: (id: string, item: Partial<MyEntity>) => void;
  removeMyEntity: (id: string) => void;
  loadMyEntities: (options?: { search?: string }) => Promise<void>;
}
```

## Étape 2 — Implémenter dans `create()`

```ts
export const useAppStore = create<AppState>()(
  devtools((set, get) => ({
    // ... slices existants

    myEntities: [],
    setMyEntities: (myEntities) => set({ myEntities }),
    addMyEntity: (item) => set((s) => ({ myEntities: [...s.myEntities, item] })),
    updateMyEntity: (id, patch) =>
      set((s) => ({
        myEntities: s.myEntities.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      })),
    removeMyEntity: (id) =>
      set((s) => ({ myEntities: s.myEntities.filter((e) => e.id !== id) })),
    loadMyEntities: async (options) => {
      const params = new URLSearchParams();
      if (options?.search) params.set('search', options.search);
      const res = await fetch(`/api/my-entities?${params}`);
      if (!res.ok) throw new Error('Failed to load my entities');
      const items = await res.json();
      set({ myEntities: items });
    },
  }))
);
```

## Étape 3 — Mettre à jour le type

Dans `src/types/index.ts` :

```ts
export interface MyEntity {
  id: string;
  name: string;
  // ... aligné sur le modèle Prisma
  createdAt: string;
  updatedAt: string;
}
```

## Conventions

- **Optimistic update** pour `add` / `update` / `remove` — l'API est appelée par le composant, pas par le store, pour pouvoir rollback proprement.
- **`load*` async** : retourne `Promise<void>`, throw en cas d'erreur (le composant gère le toast).
- **Pagination** : ajouter `loadMoreMyEntities(page, itemsPerPage, options)` qui retourne `{ hasMore, newItems }` si nécessaire.
- **Cache** : si la même requête est faite deux fois consécutivement avec les mêmes filtres, court-circuiter via un `_lastMyEntitiesRequestKey` interne.

## Anti-patterns

- ❌ Pas de second store parallèle
- ❌ Pas de logique métier complexe dans les setters — la déporter dans des helpers
- ❌ Pas de mutation directe (`s.myEntities.push(...)`)
- ❌ Pas de `useAppStore()` sans selector dans les composants

## Checklist

1. [ ] Type ajouté dans `src/types/index.ts`
2. [ ] Interface `AppState` étendue
3. [ ] Setters + loader implémentés dans `create()`
4. [ ] Composant qui consomme le slice testé (pas de re-render excessif)
