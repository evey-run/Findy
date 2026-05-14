---
description: Zustand store conventions
globs: "src/store/**"
---

# State Management — Zustand

## Fichier

Store unique : `src/store/index.ts` exposé via `useAppStore` (avec middleware `devtools`).

## Pattern

```ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface AppState {
  banks: Bank[];
  setBanks: (banks: Bank[]) => void;
  loadBanks: (userId?: string) => Promise<void>;
}

export const useAppStore = create<AppState>()(
  devtools((set, get) => ({
    banks: [],
    setBanks: (banks) => set({ banks }),
    loadBanks: async (userId) => {
      const res = await fetch(`/api/banks${userId ? `?userId=${userId}` : ''}`);
      const banks = await res.json();
      set({ banks });
    },
  }))
);
```

## Conventions

- **Setters dédiés** : pour chaque champ persistant, fournir `setX`, `addX`, `updateX`, `removeX`, `loadX`.
- **Async loaders** : nommer `loadX(...)` ou `loadAllX(...)`. Toujours retourner `Promise<void>` (ou un payload si nécessaire pour la pagination).
- **Optimistic updates** : pour les mutations rapides (création / édition), mettre à jour le store immédiatement puis appeler l'API. Rollback en cas d'erreur via toast.
- **Pagination** : exposer `loadMoreX(page, itemsPerPage, options)` qui retourne `{ hasMore, newItems }`.
- **Cache key** : utiliser un champ interne `_lastXRequestKey` pour éviter les fetchs en double quand les filtres n'ont pas changé.

## Utilisation côté composant

```tsx
import { useAppStore } from '../store';

const banks = useAppStore((s) => s.banks);
const loadBanks = useAppStore((s) => s.loadBanks);

useEffect(() => { loadBanks(); }, [loadBanks]);
```

- **Toujours sélectionner un slice précis** (`(s) => s.banks`) plutôt que tout le store, pour éviter les re-renders inutiles.
- **Ne pas appeler `useAppStore()` sans selector** dans un composant qui ne lit pas tout l'état.

## Anti-patterns

- ❌ Pas de second store parallèle — toujours étendre `useAppStore`
- ❌ Pas de logique métier complexe dans les setters — déporter dans les loaders ou des helpers
- ❌ Pas de mutation directe de l'état (`s.banks.push(...)`) — toujours `set({ banks: [...s.banks, newBank] })`
