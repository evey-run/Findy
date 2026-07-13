# Makefile pour Finance Duo
# Projet de gestion financière pour couple

.PHONY: help install dev build clean test start-backend start-frontend stop db-reset db-seed version release

# Variables
NODE_BIN = npm
SERVER_DIR = server
CLIENT_DIR = .

# Aide par défaut
help:
	@echo "Finance Duo - Commandes disponibles :"
	@echo ""
	@echo "  make install      - Installer toutes les dépendances"
	@echo "  make dev          - Démarrer en mode développement (frontend + backend)"
	@echo "  make start-frontend - Démarrer seulement le frontend"
	@echo "  make start-backend  - Démarrer seulement le backend"
	@echo "  make build        - Construire pour la production"
	@echo "  make test         - Lancer les tests"
	@echo "  make clean        - Nettoyer les fichiers temporaires"
	@echo "  make db-reset     - Réinitialiser la base de données"
	@echo "  make db-seed      - Peupler la base avec des données de test"
	@echo "  make stop         - Arrêter tous les processus"
	@echo "  make version b=patch - Incrémenter la version (patch/minor/major/x.y.z)"
	@echo "  make release b=patch - Release via GitHub Actions"
	@echo ""

# Installation des dépendances
install:
	@echo "📦 Installation des dépendances..."
	$(NODE_BIN) install
	cd $(SERVER_DIR) && $(NODE_BIN) install

# Développement (frontend + backend)
dev:
	@echo "🚀 Démarrage en mode développement..."
	$(NODE_BIN) run dev

# Démarrer seulement le frontend
start-frontend:
	@echo "🌐 Démarrage du frontend..."
	$(NODE_BIN) run dev:frontend

# Démarrer seulement le backend
start-backend:
	@echo "🔧 Démarrage du backend..."
	$(NODE_BIN) run dev:backend

# Construction pour la production
build:
	@echo "🏗️  Construction pour la production..."
	$(NODE_BIN) run build

# Tests
test:
	@echo "🧪 Lancement des tests..."
	$(NODE_BIN) run test

# Nettoyage
clean:
	@echo "🧹 Nettoyage des fichiers temporaires..."
	rm -rf node_modules/.vite
	rm -rf dist
	rm -rf $(SERVER_DIR)/dist
	rm -f postcss.config.js tailwind.config.js
	@echo "✅ Nettoyage terminé"

# Arrêter tous les processus
stop:
	@echo "🛑 Arrêt des processus..."
	-pkill -f "vite"
	-pkill -f "tsx watch"
	@echo "✅ Processus arrêtés"

# Base de données - Reset
db-reset:
	@echo "🗄️  Réinitialisation de la base de données..."
	cd $(SERVER_DIR) && npx prisma migrate reset --force
	@echo "✅ Base de données réinitialisée"

# Base de données - Seed
db-seed:
	@echo "🌱 Peuplement de la base avec des données de test..."
	cd $(SERVER_DIR) && npx prisma db seed
	@echo "✅ Données de test ajoutées"

# Version bump (ex: make version b=patch)
version:
	@node scripts/version-bump.mjs $(b)

# Release via GitHub Actions (ex: make release b=patch)
release:
	@gh workflow run release.yml -f bump_type=$(b)
	@echo "🚀 Release déclenchée via GitHub Actions"

# Commande par défaut
.DEFAULT_GOAL := help
