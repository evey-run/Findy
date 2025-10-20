# 💰 Finance Tracker

Une application moderne et complète de gestion financière personnelle développée avec React, TypeScript et Express.

## ✨ Fonctionnalités

### 📊 Gestion des Transactions
- Ajout, modification et suppression de transactions
- Import de transactions via fichiers CSV
- Catégorisation automatique et manuelle
- Gestion des transactions d'investissement (prix unitaire et quantité)
- Filtrage et recherche avancés
- Validation des transactions

### 🏦 Gestion des Banques
- Gestion de plusieurs comptes bancaires
- Types de comptes (courant, épargne, investissement)
- Suivi des soldes en temps réel
- Archivage des comptes
- Gestion des IBAN
- Personnalisation (couleurs, logos)

### 📈 Budgets
- Création de budgets par catégorie
- Périodes configurables (mensuel, annuel)
- Budgets partagés ou individuels
- Suivi des dépenses vs budget
- Alertes de dépassement

### 🔄 Récurrences
- Gestion des transactions récurrentes
- Fréquences personnalisables
- Génération automatique des transactions futures
- Activation/désactivation des récurrences

### 🎯 Objectifs Financiers
- Définition d'objectifs d'épargne
- Suivi de la progression
- Dates limites et descriptions

### 📊 Tableau de Bord
- Vue d'ensemble des finances
- Graphiques et statistiques
- Analyses par catégorie et période
- Tendances et prévisions

### 👥 Multi-utilisateurs
- Gestion de plusieurs profils utilisateurs
- Avatars personnalisés
- Banques associées aux utilisateurs

### 🏷️ Catégories Intelligentes
- Catégorisation automatique par mots-clés
- Types de catégories (revenus/dépenses)
- Personnalisation (couleurs, icônes)
- Gestion des mots-clés pour la détection automatique

## 🛠️ Technologies

### Frontend
- **React 19** - Bibliothèque UI
- **TypeScript** - Typage statique
- **Vite** - Build tool et dev server
- **React Router** - Navigation
- **Zustand** - Gestion d'état
- **Recharts** - Graphiques et visualisations
- **Tailwind CSS** - Styling
- **Lucide React** - Icônes
- **React Hot Toast** - Notifications

### Backend
- **Express 5** - Framework Node.js
- **TypeScript** - Typage statique
- **Prisma** - ORM et migrations
- **SQLite** - Base de données
- **Multer** - Upload de fichiers
- **Papa Parse** - Parsing CSV
- **CORS** - Gestion des requêtes cross-origin

## 📦 Installation

### Prérequis
- Node.js (version 18 ou supérieure)
- npm ou yarn

### Étapes d'installation

1. **Cloner le dépôt**
```bash
git clone <url-du-repo>
cd Finance-Tracker
```

2. **Installer les dépendances**
```bash
npm install
```

3. **Configurer l'environnement**

Créer un fichier `.env` à la racine du projet :
```env
DATABASE_URL="file:./prisma/dev.db"
PORT=3001
```

4. **Initialiser la base de données**
```bash
npm run db:generate
npm run db:migrate
```

5. **Optionnel : Peupler avec des données de test**
```bash
npm run db:seed
```

## 🚀 Démarrage

### Mode Développement

Lancer le frontend et le backend simultanément :
```bash
npm run dev
```

Ou séparément :
```bash
# Frontend uniquement (port 5173)
npm run dev:frontend

# Backend uniquement (port 3001)
npm run dev:server
```

### Accès à l'application
- **Frontend** : http://localhost:5173
- **API Backend** : http://localhost:3001

## 🗄️ Scripts Disponibles

```bash
# Développement
npm run dev              # Lance frontend + backend
npm run dev:frontend     # Lance uniquement Vite
npm run dev:server       # Lance uniquement le serveur Express

# Build
npm run build            # Build le frontend
npm run build:server     # Build le backend

# Base de données
npm run db:migrate       # Lance les migrations Prisma
npm run db:generate      # Génère le client Prisma
npm run db:studio        # Ouvre Prisma Studio
npm run db:seed          # Peuple la DB avec des données de test

# Qualité de code
npm run lint             # Vérifie le code avec ESLint

# Preview
npm run preview          # Preview du build de production
```

## 📁 Structure du Projet

```
Finance-Tracker/
├── src/                    # Code source frontend
│   ├── components/         # Composants React
│   │   ├── Dashboard.tsx
│   │   ├── Transactions.tsx
│   │   ├── Banks.tsx
│   │   ├── Categories.tsx
│   │   ├── Budgets.tsx
│   │   ├── Investissement.tsx
│   │   └── ...
│   ├── api/               # Client API
│   ├── store/             # Store Zustand
│   ├── types/             # Types TypeScript
│   └── styles/            # Styles globaux
├── server/                # Code source backend
│   └── src/
│       ├── index.ts       # Point d'entrée du serveur
│       ├── routes/        # Routes API
│       │   ├── transactions.ts
│       │   ├── banks.ts
│       │   ├── categories.ts
│       │   ├── budgets.ts
│       │   ├── recurrences.ts
│       │   ├── objectives.ts
│       │   └── ...
│       └── utils/         # Utilitaires
├── prisma/                # Configuration Prisma
│   ├── schema.prisma      # Schéma de base de données
│   ├── dev.db             # Base de données SQLite
│   └── migrations/        # Migrations
├── public/                # Assets statiques
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

## 🗃️ Modèle de Données

Le projet utilise Prisma avec SQLite et comprend les modèles suivants :

- **User** - Utilisateurs de l'application
- **Bank** - Comptes bancaires
- **Category** - Catégories de transactions
- **Transaction** - Transactions financières
- **Budget** - Budgets par catégorie
- **Recurrence** - Transactions récurrentes
- **Objective** - Objectifs financiers
- **UserBank** - Association utilisateurs-banques
- **CategoryKeyword** - Mots-clés pour catégorisation automatique

## 🔌 API Endpoints

Le serveur expose les endpoints suivants :

- `GET/POST/PUT/DELETE /api/transactions` - Gestion des transactions
- `GET/POST/PUT/DELETE /api/banks` - Gestion des banques
- `GET/POST/PUT/DELETE /api/categories` - Gestion des catégories
- `GET/POST/PUT/DELETE /api/budgets` - Gestion des budgets
- `GET/POST/PUT/DELETE /api/recurrences` - Gestion des récurrences
- `GET/POST/PUT/DELETE /api/objectives` - Gestion des objectifs
- `GET/POST/DELETE /api/users` - Gestion des utilisateurs
- `GET /api/dashboard` - Données du tableau de bord

## 🎨 Personnalisation

L'application utilise Tailwind CSS pour le styling. Vous pouvez personnaliser les couleurs, espacements et autres styles dans `tailwind.config.js`.

## 🐛 Débogage

Pour déboguer l'application :

1. Vérifier les logs du serveur dans le terminal
2. Utiliser les outils de développement du navigateur
3. Consulter Prisma Studio pour inspecter la base de données : `npm run db:studio`

## 📝 Licence

Ce projet est sous licence privée.

## 👨‍💻 Développement

Ce projet est en développement actif. Les contributions et suggestions sont les bienvenues !
