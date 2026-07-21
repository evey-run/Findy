# Contribuer à Findy

Merci de vouloir contribuer ! Voici comment :

## Signaler un bug

- Ouvrez une [issue](https://github.com/avialleguerin/Findy/issues/new) avec :
  - Un titre clair
  - Les étapes pour reproduire
  - Le comportement attendu vs observé
  - Votre version de l'app et OS

## Proposer une feature

- Ouvrez une issue d'abord pour discuter de l'idée avant de coder.

## Envoyer une PR

1. Fork le repo
2. Créez une branche (`git checkout -b feat/ma-feature`)
3. Codez, testez, lintez (`npm run lint`)
4. Une feature = une PR
5. Décrivez clairement ce que change votre PR

## Setup dev

```bash
git clone https://github.com/avialleguerin/Findy.git
cd Findy
npm install
npm run db:generate && npm run db:migrate
npm run dev
```

## Convention

- TypeScript partout
- Composants React dans `src/components/`
- Routes API dans `server/src/routes/`
- Commits en français si possible
