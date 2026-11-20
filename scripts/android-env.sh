#!/usr/bin/env bash
#
# Prépare l'environnement Android puis exécute la commande passée en argument.
#
# Le CLI Tauri a besoin de trois variables que rien n'installe : `JAVA_HOME`,
# `ANDROID_HOME` et `NDK_HOME`. Les poser dans `~/.zshrc` marche depuis un
# terminal, mais les scripts de Conductor et les hooks de CI tournent dans un
# shell non interactif où ce fichier n'est pas lu — d'où ce préambule, qui rend
# `npm run tauri:android` reproductible d'où qu'il parte.
set -euo pipefail

# ── JDK ─────────────────────────────────────────────────────────────────────
# Celui d'Android Studio d'abord : c'est la version que le plugin Gradle
# attend, et la seule présente sur une machine où aucun JDK n'a été installé à
# la main. `/usr/libexec/java_home` sert de repli sur macOS.
if [ -z "${JAVA_HOME:-}" ]; then
  ANDROID_STUDIO_JBR="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  if [ -d "$ANDROID_STUDIO_JBR" ]; then
    export JAVA_HOME="$ANDROID_STUDIO_JBR"
  elif [ -x /usr/libexec/java_home ]; then
    export JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null || true)"
  fi
fi

if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  echo "Aucun JDK trouvé. Installez Android Studio, ou renseignez JAVA_HOME." >&2
  exit 1
fi

# ── SDK ─────────────────────────────────────────────────────────────────────
if [ -z "${ANDROID_HOME:-}" ]; then
  export ANDROID_HOME="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
fi

if [ ! -d "$ANDROID_HOME" ]; then
  echo "SDK Android introuvable à $ANDROID_HOME (voir ANDROID_HOME)." >&2
  exit 1
fi

# ── NDK ─────────────────────────────────────────────────────────────────────
# La version la plus récente parmi celles installées : figer un numéro ici
# obligerait à modifier ce script à chaque mise à jour du SDK, et un NDK absent
# fait échouer le CLI avec un message peu parlant.
if [ -z "${NDK_HOME:-}" ]; then
  NDK_DIR="$ANDROID_HOME/ndk"
  if [ -d "$NDK_DIR" ]; then
    LATEST_NDK="$(ls -1 "$NDK_DIR" 2>/dev/null | sort -V | tail -1)"
    [ -n "$LATEST_NDK" ] && export NDK_HOME="$NDK_DIR/$LATEST_NDK"
  fi
fi

if [ -z "${NDK_HOME:-}" ] || [ ! -d "$NDK_HOME" ]; then
  echo "NDK Android introuvable. Installez-le depuis Android Studio (SDK Manager)." >&2
  exit 1
fi

export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

exec "$@"
