---
description: Styling conventions — Tailwind + commonStyles
globs: "src/**/*.tsx,src/styles/**"
---

# Styling Conventions

## Source de vérité

`src/styles/commonStyles.ts` exporte les constantes harmonisées :
- `colors` (palette : primary `#6226fa`, background `#202427`, etc.)
- `borderRadius` (`sm`, `md`, `lg`, `xl`, `full`)
- `textSizes` (`xs` → `2xl`)
- `spacing` (cards, inputs, boutons, gaps)
- `commonClasses` (cartes, headers, etc.)

## Règle d'or

**Avant de hardcoder une couleur / un radius / une taille de texte, vérifier qu'il n'existe pas déjà une constante dans `commonStyles.ts`.**

```tsx
// ❌ Hardcodé
<div className="bg-[#272a2f] rounded-2xl p-6">

// ✅ Via constantes
import { colors, borderRadius, spacing } from '../styles/commonStyles';
<div className={`bg-[${colors.cardBackground}] ${borderRadius.xl} ${spacing.card}`}>
```

## Tailwind

- Classes Tailwind directement dans `className`, pas de `styled-components` ni de CSS modules
- Mode sombre par défaut (background `#202427`) — pas de toggle light/dark pour le moment
- `clsx` ou simple template literal pour la concaténation conditionnelle

## Layout

- Padding bas standardisé à 40px sur les pages scrollables (cf. commit `2bae7c7`)
- Container principal : `max-w-7xl mx-auto px-4`
- Grilles : `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

## Iconographie

- `lucide-react` en priorité (style cohérent avec le reste de l'app)
- `@heroicons/react` toléré pour les écrans existants, à migrer progressivement

## Anti-patterns

- ❌ Pas de `style={{ ... }}` inline pour des choses couvrables par Tailwind
- ❌ Pas de scripts `harmonize-*.js` à exécuter sans relire — préférer corriger à la main
- ❌ Pas de couleurs en dur si elles existent dans la palette
