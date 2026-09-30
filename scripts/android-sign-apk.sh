#!/usr/bin/env bash
#
# Signe l'APK universel de release produit par `npm run tauri:android:build`.
#
# `tauri android build --apk` génère un APK de release NON signé
# (app-universal-release-unsigned.apk), qu'Android refuse d'installer
# (INSTALL_PARSE_FAILED_NO_CERTIFICATES). Ce script recaligne et signe l'APK
# avec le keystore de release avant de le déposer à sa place finale (findy.apk).
#
# Usage : bash scripts/android-sign-apk.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/release"
KS="$ROOT/src-tauri/keystore/findy-release.keystore"

STORE_PASS="${FINDY_STORE_PASSWORD:-findy-release-2026}"
KEY_PASS="${FINDY_KEY_PASSWORD:-$STORE_PASS}"

if [ ! -f "$KS" ]; then
  echo "Keystore introuvable : $KS" >&2
  echo "Générez-le avec : keytool -genkeypair -keystore $KS -alias findy \\" >&2
  echo "  -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Findy,O=Findy,C=LT'" >&2
  exit 1
fi

BT_DIR="$HOME/Library/Android/sdk/build-tools"
BT="$(ls -1 "$BT_DIR" 2>/dev/null | sort -V | tail -1)"
if [ -z "$BT" ] || [ ! -x "$BT_DIR/$BT/apksigner" ]; then
  echo "build-tools Android introuvable." >&2
  exit 1
fi
APKSIGNER="$BT_DIR/$BT/apksigner"
ZIPALIGN="$BT_DIR/$BT/zipalign"

UNSIGNED="${UNSIGNED:-$OUT_DIR/app-universal-release-unsigned.apk}"
if [ ! -f "$UNSIGNED" ]; then
  if [ -f "$OUT_DIR/findy.apk" ] \
      && ! "$APKSIGNER" verify "$OUT_DIR/findy.apk" >/dev/null 2>&1; then
    UNSIGNED="$OUT_DIR/findy.apk"
  else
    echo "APK unsigned introuvable : $UNSIGNED" >&2
    echo "Lancez d'abord : npm run tauri:android:build" >&2
    exit 1
  fi
fi

TMPDIR_SIGN="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_SIGN"' EXIT

"$ZIPALIGN" -f -p 4 "$UNSIGNED" "$TMPDIR_SIGN/findy-aligned.apk"
"$APKSIGNER" sign \
  --ks "$KS" \
  --ks-key-alias findy \
  --ks-pass "pass:$STORE_PASS" \
  --key-pass "pass:$KEY_PASS" \
  --out "$TMPDIR_SIGN/findy.apk" \
  "$TMPDIR_SIGN/findy-aligned.apk"

"$APKSIGNER" verify "$TMPDIR_SIGN/findy.apk"

mv "$TMPDIR_SIGN/findy.apk" "$OUT_DIR/findy.apk"
echo
echo "APK signé : $OUT_DIR/findy.apk"