#!/usr/bin/env bash
# Run the Logos node web UI in the foreground: serves the built UI and proxies /api to the node.
#   HOST      bind address (default: this box's Tailscale IPv4, else 127.0.0.1)
#   PORT      default 8090
#   NODE_API  node HTTP API (default http://127.0.0.1:8080)
# The UI has mining and wallet controls and NO login. Binding all interfaces must be a
# deliberate choice: set HOST=0.0.0.0 only on a trusted network.
set -euo pipefail
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${HOST:-}" ]; then
  HOST="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  HOST="${HOST:-127.0.0.1}"
fi
exec python3 "$DIR/serve.py" --dist "$DIR/dist" --node "${NODE_API:-http://127.0.0.1:8080}" \
  --host "$HOST" --port "${PORT:-8090}"
