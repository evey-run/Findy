---
description: Workflow rules — goal-driven execution and surfacing ambiguity before implementing
---

# Workflow Rules

## Surface Ambiguity

**Si une demande a plusieurs interprétations raisonnables, les lister avant d'implémenter. Ne jamais choisir silencieusement.**

Exemples de demandes ambiguës sur ce repo :
- "Améliore le dashboard" → quelle section ? performances / nouveau widget / refonte UI ?
- "Ajoute un export" → CSV / PDF / API endpoint / téléchargement direct ?
- "Fix les transactions" → quel bug précis ? (filtrage / pagination / catégorisation auto / import CSV)

Format attendu :

```
"X" peut vouloir dire :
1. [Interprétation A] — [impact / effort]
2. [Interprétation B] — [impact / effort]

Laquelle ?
```

**Pourquoi** : choisir silencieusement = 30 min de code à jeter quand l'interprétation est fausse.

## Goal-Driven Execution

**Transforme chaque tâche non-triviale en objectif vérifiable, pas en instruction impérative.**

| Au lieu de... | Transforme en... |
|---------------|------------------|
| "Ajoute la validation" | Définir les inputs invalides à rejeter, puis vérifier qu'ils renvoient bien `400` |
| "Fix le bug" | Reproduire le bug avec une étape concrète, puis vérifier qu'elle ne le déclenche plus |
| "Refactor X" | S'assurer que le comportement utilisateur reste identique avant ET après |

Pour une tâche multi-étapes, énoncer brièvement le plan avec critère de vérif :

```
1. [Étape] → vérif: [check]
2. [Étape] → vérif: [check]
```

**Quand appliquer** : features non-triviales, bug fixes, refactors. Pour les one-liners évidents (typo, renommage), utiliser le jugement.

## Communication

- Toujours communiquer en **français** avec l'utilisateur (UI et code en français aussi).
- Réponses courtes et directes. Pas de récap inutile à la fin si le diff parle de lui-même.
