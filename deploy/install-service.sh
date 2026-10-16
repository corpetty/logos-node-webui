#!/usr/bin/env bash
# Install the web UI as a systemd *user* service (logos-webui.service), started now and at boot.
# Same env as run.sh (HOST, PORT, NODE_API, ALLOW), captured at install time. Re-run to change them.
# Boot without a login needs lingering: `loginctl enable-linger $USER` (one-time, may need sudo).
set -euo pipefail
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-0.0.0.0}"; PORT="${PORT:-8090}"
NODE_API="${NODE_API:-http://127.0.0.1:8080}"; ALLOW="${ALLOW:-private}"
UNIT="$HOME/.config/systemd/user/logos-webui.service"
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNIT
[Unit]
Description=Logos node web UI (logos-node-webui) + /api proxy to the local node

[Service]
ExecStart=/usr/bin/env python3 "$DIR/serve.py" --dist "$DIR/dist" --node $NODE_API --host $HOST --port $PORT --allow $ALLOW
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now logos-webui.service
systemctl --user restart logos-webui.service
echo "logos-webui.service: $(systemctl --user is-active logos-webui.service) (node $NODE_API, allow $ALLOW)"
for ip in $(hostname -I 2>/dev/null) $(tailscale ip -4 2>/dev/null); do echo "  http://$ip:$PORT"; done
[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] || \
  echo "note: lingering is off, so the service stops when you log out. Enable: loginctl enable-linger $USER"
