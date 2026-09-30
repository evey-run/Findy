#!/usr/bin/env bash
#
# Lance l'application sur le simulateur iOS.
#
# `tauri ios dev` sans argument affiche la liste des simulateurs et attend un
# numéro au clavier. C'est confortable dans un terminal, mais un script de
# lancement Conductor ou une CI s'y arrêtent indéfiniment. On lui désigne donc
# un simulateur : celui qui tourne déjà, sinon le plus récent, démarré au
# passage.
set -euo pipefail

booted_simulator() {
  xcrun simctl list devices booted 2>/dev/null \
    | sed -n 's/^ *\(.*\) ([0-9A-F-]\{36\}) (Booted).*/\1/p' \
    | head -1
}

DEVICE="$(booted_simulator)"

if [ -z "$DEVICE" ]; then
  # `simctl list` groupe par version d'iOS et les trie du plus ancien au plus
  # récent : la dernière ligne est donc l'iPhone le plus récent installé.
  DEVICE="$(xcrun simctl list devices available 2>/dev/null \
    | sed -n 's/^ *\(iPhone [^(]*[^ (]\) ([0-9A-F-]\{36\}) (Shutdown).*/\1/p' \
    | tail -1)"

  if [ -z "$DEVICE" ]; then
    echo "Aucun simulateur iPhone disponible. Installez-en un depuis Xcode." >&2
    exit 1
  fi

  echo "Démarrage du simulateur : $DEVICE"
  xcrun simctl boot "$DEVICE" >/dev/null 2>&1 || true
  open -a Simulator

  # Le CLI échoue si l'installation démarre avant que SpringBoard ne réponde.
  for _ in $(seq 1 30); do
    [ -n "$(booted_simulator)" ] && break
    sleep 1
  done
else
  echo "Simulateur déjà démarré : $DEVICE"
fi

exec npx tauri ios dev "$DEVICE" "$@"
