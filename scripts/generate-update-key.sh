#!/usr/bin/env bash
# Génère une paire de clés pour signer les mises à jour Tauri.
# La clé privée doit être ajoutée comme secret GitHub Actions : TAURI_SIGNING_PRIVATE_KEY
# La clé publique est intégrée dans src-tauri/tauri.conf.json (plugins.updater.pubkey)

set -euo pipefail

KEY_DIR="keys"
mkdir -p "$KEY_DIR"

echo "Génération de la paire de clés pour la mise à jour..."
echo ""

npx tauri signer generate -w "$KEY_DIR/update.key"

echo ""
echo "=== Clé privée ==="
echo "Fichier : $KEY_DIR/update.key"
echo ""
echo "AJOUTE CETTE CLÉ COMME SECRET GITHUB ACTIONS :"
echo "  1. Va sur https://github.com/evey-run/Findy/settings/secrets/actions"
echo "  2. Crée un secret nommé TAURI_SIGNING_PRIVATE_KEY"
echo "  3. Colle le contenu brut de $KEY_DIR/update.key"
echo ""
echo "=== Clé publique ==="
echo "Fichier : $KEY_DIR/update.key.pub"
cat "$KEY_DIR/update.key.pub"
echo ""
echo "Mets à jour la valeur de plugins.updater.pubkey dans src-tauri/tauri.conf.json"
echo "avec le contenu de $KEY_DIR/update.key.pub"
echo ""
echo "IMPORTANT : Ne commite JAMAIS $KEY_DIR/update.key dans git !"
