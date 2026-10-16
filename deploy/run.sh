#!/usr/bin/env bash
# Run the Logos node web UI in the foreground: serves the built UI and proxies /api to the node.
#   HOST      bind address (default 0.0.0.0: every interface, so LAN and Tailscale both work)
#   PORT      default 8090
#   NODE_API  node HTTP API (default http://127.0.0.1:8080)
#   ALLOW     who may connect: "private" (default: loopback, LAN, Tailscale), "any", or CIDRs
# The UI has mining and wallet controls and NO login. Clients outside ALLOW are dropped, so a
# port-forwarded public address cannot reach it. Use ALLOW=any only on a network you trust.
set -euo pipefail
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-0.0.0.0}"; PORT="${PORT:-8090}"
echo "open: $(for ip in $(hostname -I 2>/dev/null) $(tailscale ip -4 2>/dev/null); do printf 'http://%s:%s  ' "$ip" "$PORT"; done)"
exec python3 "$DIR/serve.py" --dist "$DIR/dist" --node "${NODE_API:-http://127.0.0.1:8080}" \
  --host "$HOST" --port "$PORT" --allow "${ALLOW:-private}"
