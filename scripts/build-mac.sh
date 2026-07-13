#!/usr/bin/env bash
# Build complet de l'app Findy pour macOS (sans signature Apple)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║    Findy — Build macOS (unsigned)    ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Version bump (optionnel)
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Version actuelle: v${CURRENT_VERSION}"
echo ""
echo "Incrémenter la version avant le build ?"
echo "  1) patch  (ex: ${CURRENT_VERSION} → patch)"
echo "  2) minor  (ex: ${CURRENT_VERSION} → minor)"
echo "  3) major  (ex: ${CURRENT_VERSION} → major)"
echo "  4) non, garder v${CURRENT_VERSION}"
echo ""
read -p "Choix [1/2/3/4]: " BUMP_CHOICE

case "${BUMP_CHOICE}" in
  1) node scripts/version-bump.mjs patch ;;
  2) node scripts/version-bump.mjs minor ;;
  3) node scripts/version-bump.mjs major ;;
  *) echo "  → Build avec v${CURRENT_VERSION}" ;;
esac

NEW_VERSION=$(node -p "require('./package.json').version")
echo ""

# 1. Dépendances
echo "[1/5] Installation des dépendances npm..."
npm install --silent

# 2. Générer le client Prisma (avec binaryTargets darwin + darwin-arm64)
echo "[2/5] Génération du client Prisma..."
npx prisma generate

# 3. Compiler le serveur Express → binaire autonome (Bun)
echo "[3/5] Compilation du serveur Express..."
bash "$REPO_ROOT/scripts/build-server.sh"

# 4. Build du frontend React
echo "[4/5] Build du frontend Vite..."
npm run build

# 5. Build Tauri (crée le .app + .dmg dans src-tauri/target/release/bundle/)
echo "[5/5] Build Tauri (v${NEW_VERSION})..."
npm run tauri build -- --no-bundle 2>/dev/null || true
npm run tauri build

echo ""
echo "✅ Build terminé — v${NEW_VERSION}"
echo ""
echo "Artefacts:"
find src-tauri/target/release/bundle -name "*.dmg" -o -name "*.app" 2>/dev/null | head -10
echo ""
echo "⚠️  Sans signature Apple, les utilisateurs doivent exécuter fix-quarantine.command"
echo "   après le téléchargement (inclus dans le DMG)."
