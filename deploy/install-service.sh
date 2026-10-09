#!/usr/bin/env bash
# Install the web UI as a systemd *user* service (logos-webui.service), started now and at boot.
# Same env as run.sh (HOST, PORT, NODE_API), captured at install time. Re-run to change them.
# Boot without a login needs lingering: `loginctl enable-linger $USER` (one-time, may need sudo).
set -euo pipefail
DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${HOST:-}" ]; then
  HOST="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  HOST="${HOST:-127.0.0.1}"
fi
PORT="${PORT:-8090}"; NODE_API="${NODE_API:-http://127.0.0.1:8080}"
UNIT="$HOME/.config/systemd/user/logos-webui.service"
mkdir -p "$(dirname "$UNIT")"
cat > "$UNIT" <<UNIT
[Unit]
Description=Logos node web UI (logos-node-webui) + /api proxy to the local node
After=network-online.target

[Service]
ExecStart=/usr/bin/env python3 $DIR/serve.py --dist $DIR/dist --node $NODE_API --host $HOST --port $PORT
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable --now logos-webui.service
systemctl --user restart logos-webui.service
echo "logos-webui.service: $(systemctl --user is-active logos-webui.service) -> http://$HOST:$PORT (node $NODE_API)"
[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" = yes ] || \
  echo "note: lingering is off, so the service stops when you log out. Enable: loginctl enable-linger $USER"
