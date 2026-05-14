---
description: Git commit and PR conventions
globs: *
---

# Git Conventions

## Commits atomiques

Chaque commit = UN SEUL changement logique. Ne jamais mélanger feature, fix et refactoring.

## Conventional Commits

```
<type>(<scope>): <description courte impérative en anglais>
```

Types : `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`

Scopes utilisés sur ce repo : `transactions`, `banks`, `categories`, `budgets`, `recurrences`, `objectives`, `dashboard`, `users`, `api`, `ui`, `db`, `store`, `styles`...

Exemples :
- `feat(transactions): add CSV import with auto-categorization`
- `fix(banks): prevent balance recompute on archived accounts`
- `refactor(store): extract bank loader into dedicated slice`
- `style(dashboard): standardize bottom padding to 40px`

## Règles strictes

1. Avant de commit : `npm run lint` — jamais commit avec des erreurs
2. Vérifier que le serveur démarre (`npm run dev:server`) si on a touché à `server/`
3. Vérifier que le front compile (`npm run build`) si on a touché à `src/`
4. Chaque commit doit laisser l'app fonctionnelle
5. Tâche multi-étapes → plusieurs commits ordonnés logiquement

## Fichiers à NE JAMAIS commit

- Fichiers `*.bak`, `*_old.tsx`, `*_new.tsx` — supprimer avant commit
- `prisma/dev.db` (déjà gitignoré — vérifier)
- Scripts `fix-*.js`, `harmonize-*.js` ad-hoc — exécuter puis supprimer

## PR Summary

Après une feature complète :

```markdown
## Summary
**What**: description concise
**Why**: contexte et motivation
**How**: approche technique

## Test plan
- [ ] Étape de test 1
- [ ] Étape de test 2
```
