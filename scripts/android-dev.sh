#!/usr/bin/env bash
#
# Lance l'application sur l'émulateur Android.
#
# `tauri android dev` a besoin d'un appareil déjà connecté : sans cela il pose
# une question, ce qui bloquerait un panneau de lancement Conductor. On démarre
# donc l'émulateur nous-mêmes quand rien ne tourne, puis on attend qu'il ait
# fini de booter — `adb` répond bien avant que le système ne soit prêt à
# installer quoi que ce soit.
#
# L'environnement (JAVA_HOME, ANDROID_HOME, NDK_HOME) est préparé par
# android-env.sh, que ce script appelle en dernier.
set -euo pipefail

ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$ANDROID_HOME/platform-tools/adb"
EMULATOR="$ANDROID_HOME/emulator/emulator"

has_device() {
  [ -x "$ADB" ] && "$ADB" devices | awk 'NR>1 && $2=="device"' | grep -q .
}

if ! has_device; then
  AVD="${ANDROID_AVD:-$("$EMULATOR" -list-avds 2>/dev/null | head -1)}"

  if [ -z "$AVD" ]; then
    echo "Aucun appareil connecté et aucun AVD configuré." >&2
    echo "Créez-en un depuis Android Studio (Device Manager)." >&2
    exit 1
  fi

  echo "Démarrage de l'émulateur : $AVD"
  # Détaché du terminal : l'émulateur survit au script, et sa sortie ne se
  # mélange pas aux journaux de compilation.
  "$EMULATOR" -avd "$AVD" -no-snapshot-save -no-boot-anim >/dev/null 2>&1 &

  "$ADB" wait-for-device

  # Trois barrières, et il en faut trois : `wait-for-device` ne garantit que la
  # connexion adb, `sys.boot_completed` que le système a fini de démarrer, et
  # le gestionnaire de paquets met encore un moment à accepter une
  # installation. Le CLI Tauri interroge en plus la console de l'émulateur
  # (`adb emu`) pour retrouver le nom de l'AVD : si elle ne répond pas encore,
  # il abandonne avec « Cannot connect to the emulator ».
  wait_for() {
    local label="$1"; shift
    for _ in $(seq 1 90); do
      "$@" >/dev/null 2>&1 && return 0
      sleep 2
    done
    echo "Émulateur : $label n'a pas répondu à temps." >&2
    return 1
  }

  wait_for "le démarrage" sh -c "[ \"\$('$ADB' shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')\" = 1 ]"
  wait_for "le gestionnaire de paquets" "$ADB" shell pm path android
  wait_for "la console" "$ADB" emu avd name

  echo "Émulateur prêt."
else
  echo "Appareil Android déjà connecté."
fi

exec bash "$(dirname "$0")/android-env.sh" npx tauri android dev "$@"
