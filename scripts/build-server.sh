#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINARIES_DIR="$REPO_ROOT/src-tauri/binaries"

echo "==> Compilation du serveur Express avec Bun..."

# Compiler pour arm64 (Apple Silicon)
bun build "$REPO_ROOT/server/src/index.ts" \
  --compile \
  --target=bun-darwin-arm64 \
  --outfile "$BINARIES_DIR/finance-server-aarch64-apple-darwin"

# Compiler pour x64 (Intel / Rosetta)
bun build "$REPO_ROOT/server/src/index.ts" \
  --compile \
  --target=bun-darwin-x64 \
  --outfile "$BINARIES_DIR/finance-server-x86_64-apple-darwin"

chmod +x "$BINARIES_DIR/finance-server-aarch64-apple-darwin"
chmod +x "$BINARIES_DIR/finance-server-x86_64-apple-darwin"

echo "==> Copie des engines Prisma..."

PRISMA_CLIENT="$REPO_ROOT/node_modules/.prisma/client"

cp "$PRISMA_CLIENT/libquery_engine-darwin-arm64.dylib.node" \
   "$BINARIES_DIR/libquery_engine-darwin-arm64.dylib.node"

cp "$PRISMA_CLIENT/libquery_engine-darwin.dylib.node" \
   "$BINARIES_DIR/libquery_engine-darwin.dylib.node"

echo "==> Binaires prets dans $BINARIES_DIR"
ls -lh "$BINARIES_DIR"
