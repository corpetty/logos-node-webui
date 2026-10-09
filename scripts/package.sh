#!/usr/bin/env bash
# Build the UI and pack a self-contained release tarball for CLI node boxes:
#   dist/ + serve.py + run.sh + install-service.sh + README  (needs only python3 to run)
# Writes release/logos-node-webui-<version>.tar.gz and release/logos-node-webui.tar.gz (same bytes).
set -euo pipefail
cd "$(dirname "$0")/.."
VER="${1:-$(node -p "require('./package.json').version")}"
npm run build >/dev/null
OUT=release; STAGE="$OUT/logos-node-webui"
rm -rf "$OUT"; mkdir -p "$STAGE"
cp -r dist "$STAGE/dist"
cp deploy/serve.py deploy/run.sh deploy/install-service.sh deploy/README.md "$STAGE/"
chmod +x "$STAGE"/*.sh "$STAGE/serve.py"
echo "$VER" > "$STAGE/VERSION"
tar -C "$OUT" -czf "$OUT/logos-node-webui-$VER.tar.gz" logos-node-webui
cp "$OUT/logos-node-webui-$VER.tar.gz" "$OUT/logos-node-webui.tar.gz"
rm -rf "$STAGE"
ls -l "$OUT"
