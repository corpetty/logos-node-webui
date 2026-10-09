# logos-node-webui

A **web UI for a Logos blockchain node** — a faithful web replica of the official
[`logos-blockchain/logos-blockchain-ui`](https://github.com/logos-blockchain/logos-blockchain-ui)
desktop app, matching it in style (Logos Design System) and features, wired to the node's HTTP API.
Intended to ship as the web UI (`links.ui`) for the community DAppNode package `logos-blockchain-node`.

> Community, unofficial. An original web implementation of the Logos node dashboard, built on the
> Logos ecosystem's own open-source UI + design system.

## Run on a CLI node (no build)
Each release ships a self-contained tarball (built UI + a stdlib-Python server that proxies `/api` to
the node). Needs only Python 3:

```
curl -L https://github.com/xAlisher/logos-node-webui/releases/latest/download/logos-node-webui.tar.gz | tar xz
cd logos-node-webui && ./install-service.sh     # or ./run.sh in the foreground
```

Details, settings and the security note: [deploy/README.md](deploy/README.md).

## Plan
See [docs/PLAN.md](docs/PLAN.md). Mapping specs are generated into [docs/spec/](docs/spec/):
`ui-inventory.md` + `parity-checklist.json` (every feature/action), `design-system.md` (tokens +
components), `api-map.md` (endpoints + real payloads + which view uses each).

## Develop (against a live node)
The dev server proxies `/api` to a node's HTTP API. In dev that is the **sneg** node over an ssh tunnel:

```
ssh -NL 8808:127.0.0.1:8080 sneg      # node API -> localhost:8808
npm install
npm run dev                            # http://localhost:5173, /api -> sneg
```

Point at a different node with `NODE_API=http://host:8080 npm run dev`.

## Test ("no feature or action left behind")
```
npm test        # Vitest unit/component tests
npm run e2e     # Playwright e2e against the running UI -> live node
```
Every entry in `docs/spec/parity-checklist.json` must have a corresponding test; a parity-gate test
fails the build if any official feature/action is unimplemented or untested.

## Stack
Vite + React + TypeScript. Logos DS reimplemented as CSS tokens (`src/styles/tokens.css`) + React
components (`src/ds/`). Typed API client in `src/api/`.
