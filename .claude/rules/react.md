---
description: React frontend conventions (Vite + React 19 + TypeScript)
globs: "src/**"
---

# React Frontend Conventions

## Structure

- Pages / sections principales : `src/components/<Name>.tsx` (ex: `Dashboard.tsx`, `Banks.tsx`, `Transactions.tsx`)
- Layout global : `src/components/Layout.tsx`
- API client : `src/api/<resource>.ts` (fetch direct vers `/api/...`)
- Store global : `src/store/index.ts` (Zustand)
- Types partagés : `src/types/index.ts`

## Routing

- `react-router-dom` v7 — routes définies dans `App.tsx`
- Navigation programmatique : `useNavigate()`
- Liens : `<Link to="/...">` (jamais `<a href>` pour les routes internes)

## Data fetching

- Pas de React Query — appels via `fetch` dans `src/api/` ou directement depuis le store Zustand (`loadBanks`, `loadTransactions`, etc.)
- Toujours gérer le `loading` et l'`error` état côté composant ou store
- Utiliser `react-hot-toast` pour les notifications utilisateur (succès / erreur)

## Imports

- Imports relatifs depuis le composant : `import { Foo } from '../types'`
- Pas d'extension `.ts` / `.tsx` (Vite résout automatiquement)
- Icônes : préférer `lucide-react` (déjà majoritaire) à `@heroicons/react`

## Composants

- Composants fonctionnels uniquement, hooks React 19 (`useState`, `useEffect`, `useMemo`, `useCallback`)
- Props typées via interface au-dessus du composant : `interface FooProps { ... }`
- Default export pour les composants de page, named export pour les utilitaires

## Anti-patterns

- ❌ Ne JAMAIS créer de fichier `<Name>.tsx.bak` ou `<Name>_old.tsx` — utiliser git pour l'historique
- ❌ Ne pas dupliquer un composant existant pour le modifier — éditer en place
- ❌ Ne pas hardcoder `http://localhost:3001` — utiliser un chemin relatif `/api/...` (proxy Vite)

## Tone

- Toute l'UI est en **français**, tutoyer l'utilisateur. Ex: "Ajoute une transaction", "Tes banques", "Connecte-toi"
- Format des montants : `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`
- Format des dates : `date-fns` avec locale `fr` (`format(date, 'dd MMMM yyyy', { locale: fr })`)
