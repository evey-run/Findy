#!/usr/bin/env bash
# Ce script supprime l'attribut de quarantaine macOS ajouté au téléchargement.
# Double-cliquer dessus suffit — il n'installe rien et ne modifie pas le système.

set -euo pipefail

APP_NAME="Finance.app"
SEARCH_DIRS=("$HOME/Downloads" "$HOME/Desktop" "/Applications")

echo "Recherche de $APP_NAME..."

FOUND=""
for dir in "${SEARCH_DIRS[@]}"; do
    if [[ -d "$dir/$APP_NAME" ]]; then
        FOUND="$dir/$APP_NAME"
        break
    fi
done

if [[ -z "$FOUND" ]]; then
    # Demander manuellement
    echo ""
    echo "L'app n'a pas été trouvée automatiquement."
    echo "Glisse Finance.app dans ce terminal et appuie sur Entrée:"
    read -r FOUND
    FOUND="${FOUND// /\\ }"
fi

echo "Suppression de la quarantaine sur: $FOUND"
xattr -rd com.apple.quarantine "$FOUND"
echo ""
echo "✅ Terminé. Tu peux maintenant ouvrir Finance normalement."

# Ouvrir l'app
open "$FOUND" 2>/dev/null || true

# Laisser le terminal visible 3 secondes
sleep 3
