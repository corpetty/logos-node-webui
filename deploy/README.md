# Logos node web UI: run it on a CLI node

The same web UI the DAppNode package ships, for a node you run yourself (logosctl +
`blockchain_module`, or the standalone `logos-blockchain-node`). Needs only **Python 3**: no
Node.js, no build, no Docker.

## Install

```
curl -L https://github.com/xAlisher/logos-node-webui/releases/latest/download/logos-node-webui.tar.gz | tar xz
cd logos-node-webui
./run.sh                 # foreground; Ctrl+C to stop
```

Or keep it running across reboots as a systemd user service:

```
./install-service.sh     # creates logos-webui.service and starts it
```

Open `http://<tailscale-ip>:8090`.

## Settings (env vars, for both scripts)

| Var | Default | |
|---|---|---|
| `NODE_API` | `http://127.0.0.1:8080` | the node's HTTP API (`api.backend.listen_address` in `user_config.yaml`) |
| `HOST` | this box's Tailscale IPv4, else `127.0.0.1` | bind address |
| `PORT` | `8090` | |

Example: `env PORT=8095 NODE_API=http://127.0.0.1:18080 ./run.sh`

## Security

The UI can start and stop mining and send funds, and it has **no login**. It binds to Tailscale or
localhost by default. Set `HOST=0.0.0.0` only on a network you trust.

## What it does

`serve.py` (stdlib only) serves `dist/` and forwards `/api/*` to `NODE_API`, streaming responses so
live updates work. `index.html` is sent with `Cache-Control: no-cache`, so a new release shows
without a hard reload.

## Update

Download the new release over the old folder (or into a new one and re-run `./install-service.sh`),
then `systemctl --user restart logos-webui.service`.
