# Lineup

An online, card-grid **five-in-a-row team game** for 2, 4 or 6 players, played in the browser with
friends. Create a private room, share the link, and race to build lines of five chips on a 10×10
board of playing cards.

> "Lineup" is a working title. It is defined once as `APP_NAME` in
> [`packages/shared-config`](packages/shared-config/src/index.ts) so it can be renamed. The board
> layout, artwork and rules text are original (see [`implementation_spec.md`](implementation_spec.md) §0).

## Features

- Private rooms joined by a 6-character code or a share link (`/r/ABC234`)
- 2 players (1 v 1), 4 players (2 v 2), 6 players (2 teams of 3 **or** 3 teams of 2)
- Guest play — just pick a name, no accounts
- Server-authoritative rules with hidden hands (clients never receive other hands, the deck or the RNG)
- Reconnect after refresh or network drop (your seat and hand are restored)
- Turn timer (off/30/60/90/120 s), afk handling, in-room chat, rematch
- Responsive for phones (portrait/landscape) and desktop, light/dark theme, keyboard and screen-reader support

## Tech stack

| Concern  | Choice                                                                      |
| -------- | --------------------------------------------------------------------------- |
| Runtime  | Node.js 24 LTS (22.12+ works), ESM, TypeScript 5 (`strict`)                 |
| Monorepo | pnpm workspaces                                                             |
| Rules    | Pure TypeScript package, zero runtime dependencies                          |
| Protocol | zod schemas shared by client and server                                     |
| Server   | Node `http` + Socket.IO 4, pino logging                                     |
| Client   | React 19, Vite, Tailwind CSS v4, Zustand, Motion, React Router              |
| Tests    | Vitest (+ fast-check property tests, Testing Library), Playwright E2E + axe |

## Repository layout

```
packages/
  rules/          pure game logic: board, deck, turns, line detection, views (no DOM / Node APIs)
  protocol/       zod schemas + TS types for every Socket.IO event
  shared-config/  APP_NAME, limits, defaults
apps/
  server/         Socket.IO game server; also serves the built web app and /healthz
  web/            React client
e2e/              Playwright tests (run against the built app with TEST_MODE=1)
scripts/          generate-board.ts (one-off board generator), check-bundle-size.mjs
deploy/           systemd unit, nginx and Caddy configs, update script
docs/             decisions.md (implementation choices), research/tech-stack.md
```

Dependency direction: `web → protocol, rules, shared-config`; `server → protocol, rules, shared-config`;
`protocol → rules, shared-config`; `rules → nothing`. The server contains no game logic: every move
goes through `validate`/`apply` from `@lineup/rules`.

## Getting started (development)

Requirements: **Node.js 24** (or ≥ 22.12) and **pnpm 10** (`corepack enable` installs the pinned version).

```bash
corepack enable
```

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` runs the server on <http://localhost:3001> (watch mode) and the Vite dev server on
<http://localhost:5173>, which proxies `/socket.io` to the server. Open <http://localhost:5173> in two
browser windows (one can be private/incognito) to play against yourself.

### Scripts

| Command                                        | What it does                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm install`                                 | install everything                                                                   |
| `pnpm dev`                                     | server (port 3001, watch) + web (Vite, port 5173) together                           |
| `pnpm build`                                   | build all packages and apps (`apps/web/dist`, `apps/server/dist`, `packages/*/dist`) |
| `pnpm start`                                   | run the built server; it also serves `apps/web/dist`                                 |
| `pnpm test`                                    | Vitest across all packages (rules run with a ≥95 % coverage threshold)               |
| `pnpm test:e2e`                                | build, then Playwright against the built app                                         |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | as named                                                                             |
| `pnpm run ci`                                  | lint + typecheck + test + build (note: `pnpm ci` is reserved by pnpm itself)         |
| `pnpm check-bundle`                            | fail if the initial JS exceeds 200 KB gzip                                           |
| `pnpm generate-board`                          | regenerate `packages/rules/src/boardLayout.ts` (deterministic)                       |

Run a single test file or test name:

```bash
pnpm --filter @lineup/rules test -- lines.test.ts -t "diagonal"
```

### End-to-end tests

```bash
pnpm exec playwright install --with-deps chromium webkit
```

```bash
pnpm test:e2e
```

The suite starts `node apps/server/dist/index.js` with `TEST_MODE=1` on port 3100 and runs in
Chromium, WebKit and an iPhone 13 profile. On machines without WebKit, set `E2E_NO_WEBKIT=1` to skip
the WebKit project and run the iPhone 13 profile on Chromium:

```bash
E2E_NO_WEBKIT=1 pnpm test:e2e
```

## Configuration

The server is configured only through environment variables (see [`.env.example`](.env.example)):

| Variable            | Default       | Purpose                                                                   |
| ------------------- | ------------- | ------------------------------------------------------------------------- |
| `PORT`              | `3001`        | HTTP/WebSocket port                                                       |
| `HOST`              | `0.0.0.0`     | bind address (use `127.0.0.1` behind a local reverse proxy)               |
| `WEB_DIST`          | `../web/dist` | static files directory (relative paths resolve from `apps/server`)        |
| `CORS_ORIGIN`       | unset         | only when the web app is served from a different origin (comma-separated) |
| `LOG_LEVEL`         | `info`        | pino log level (`debug`, `info`, `warn`, `error`, `silent`)               |
| `TRUST_PROXY`       | `0`           | `1` = use `X-Forwarded-For` for client IPs (set behind nginx/Caddy)       |
| `ROOM_CREATE_LIMIT` | `5`           | rooms one IP may create per minute                                        |
| `HOST_GRACE_MS`     | `30000`       | how long a disconnected host keeps the host role                          |
| `TEST_MODE`         | `0`           | `1` enables test hooks; refused when `NODE_ENV=production`                |

Logs are JSON lines on stdout. Tokens and hands are never logged.

## Deploying on a Linux server

The app is a **single Node process** that serves both the web client and the WebSocket game server,
holding all rooms in memory. One small VM (1 vCPU / 512 MB RAM) is plenty for many concurrent games.
Restarting the process ends games in progress (players see a notice and can start a new game).

Below: Ubuntu 22.04/24.04 or Debian 12 with **systemd + nginx + Let's Encrypt**. A Docker option and a
Caddy option follow.

### 1. Point a domain at the server

Create a DNS `A` (and optionally `AAAA`) record such as `play.example.com` → your server's IP.
HTTPS is strongly recommended: browsers only allow clipboard sharing and `navigator.share` on secure origins.

### 2. Install Node.js 24, pnpm, git and nginx

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git nginx
```

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
```

```bash
sudo apt-get install -y nodejs && sudo corepack enable
```

Check: `node -v` should print `v24.x`.

### 3. Create a service user and fetch the code

```bash
sudo useradd --system --create-home --home-dir /opt/lineup --shell /usr/sbin/nologin lineup
```

```bash
sudo -u lineup git clone https://github.com/<owner>/<repo>.git /opt/lineup/app
```

The rest of this guide assumes the code lives in `/opt/lineup/app`; adjust `WorkingDirectory` and
`ReadOnlyPaths` in the systemd unit if you choose another path.

### 4. Install dependencies and build

```bash
cd /opt/lineup/app && sudo -u lineup -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c 'pnpm install --frozen-lockfile && pnpm build'
```

Quick smoke test (Ctrl-C to stop):

```bash
cd /opt/lineup/app && sudo -u lineup NODE_ENV=production PORT=3001 HOST=127.0.0.1 node apps/server/dist/index.js
```

In another shell, `curl http://127.0.0.1:3001/healthz` should return `{"ok":true,...}`.

### 5. Configure and start the systemd service

```bash
sudo mkdir -p /etc/lineup && sudo cp /opt/lineup/app/.env.example /etc/lineup/lineup.env
```

Edit `/etc/lineup/lineup.env` if needed (the defaults bind to `127.0.0.1:3001` with `TRUST_PROXY=1`).
Then install the unit, pointing it at the checkout:

```bash
sudo sed 's#/opt/lineup#/opt/lineup/app#g' /opt/lineup/app/deploy/lineup.service | sudo tee /etc/systemd/system/lineup.service >/dev/null
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now lineup
```

```bash
systemctl status lineup --no-pager
```

Logs: `journalctl -u lineup -f`.

### 6. Put nginx in front (WebSockets + HTTPS)

```bash
sudo cp /opt/lineup/app/deploy/nginx.conf /etc/nginx/sites-available/lineup
```

Replace `play.example.com` with your domain in that file, then enable it:

```bash
sudo ln -sf /etc/nginx/sites-available/lineup /etc/nginx/sites-enabled/lineup && sudo nginx -t && sudo systemctl reload nginx
```

Get a free certificate (certbot edits the nginx config and sets up renewal):

```bash
sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d play.example.com
```

The important part of the nginx config is the `/socket.io/` location, which forwards the `Upgrade`
and `Connection` headers so WebSockets work. Without it the client falls back to slower long-polling.

### 7. Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```

Port 3001 does not need to be open: nginx talks to the app on `127.0.0.1`.

Open `https://play.example.com`, create a room, and share the invite link.

### Updating

```bash
cd /opt/lineup/app && sudo -u lineup -H ./deploy/update.sh && sudo systemctl restart lineup
```

`update.sh` runs `git pull --ff-only`, `pnpm install --frozen-lockfile` and `pnpm build`. Restarting
ends games in progress, so prefer quiet hours.

### Alternative: Caddy instead of nginx

Caddy obtains and renews HTTPS certificates automatically and proxies WebSockets with no extra config.
Install Caddy (<https://caddyserver.com/docs/install>), copy [`deploy/Caddyfile`](deploy/Caddyfile) to
`/etc/caddy/Caddyfile`, replace the domain, and run `sudo systemctl reload caddy`.

### Alternative: Docker

```bash
docker compose up -d --build
```

The compose file publishes the app on `127.0.0.1:3001` with `TRUST_PROXY=1`; keep nginx or Caddy in
front for HTTPS as above. Health is reported by the container's `HEALTHCHECK` (`/healthz`).

### Quick test without a domain

To let a friend on another network try it before setting up hosting, run `pnpm build && pnpm start`
locally and expose port 3001 through any HTTPS tunnel (for example `cloudflared tunnel --url
http://localhost:3001`).

### Operational notes

- **Single process only.** Rooms live in memory, so do not run several instances behind a load
  balancer (horizontal scaling is out of scope for v1).
- **Health check:** `GET /healthz` → `{"ok":true,"rooms":N,"uptime":S}`.
- **Graceful shutdown:** on `SIGTERM` the server notifies clients (`server:shutdown`) and exits.
- **Garbage collection:** rooms with nobody connected for 10 minutes, and finished rooms idle for
  30 minutes, are deleted automatically.
- **Limits:** 10 messages/s per socket (burst 20), 5 room creations per minute per IP, 1 chat message
  per second, 20 sockets per room.

## Troubleshooting

| Symptom                                | Fix                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "Reconnecting…" banner never goes away | Check `systemctl status lineup` and that nginx forwards `/socket.io/` with the `Upgrade` headers. |
| Everyone shares one rate limit         | Set `TRUST_PROXY=1` behind a reverse proxy.                                                       |
| `Refusing to start: TEST_MODE=1…`      | Remove `TEST_MODE=1` from the environment in production.                                          |
| Blank page / 404 for assets            | Run `pnpm build`; check `WEB_DIST` points at `apps/web/dist`.                                     |

## How to play (short)

On your turn, pick a card and place a chip on a matching empty cell. Wild cards (jack of diamonds or
clubs) go anywhere empty; cutter cards (jack of hearts or spades) remove an opponent chip that is not
part of a finished line. Five in a row (corners count for everyone) makes a line. Two teams need two
lines; three teams need one. The full rules are in the in-game **How to play** dialog.

## Documentation

- [`implementation_spec.md`](implementation_spec.md) — the v1 specification (single source of truth)
- [`docs/decisions.md`](docs/decisions.md) — choices made where the spec was open, and deviations
- [`docs/research/tech-stack.md`](docs/research/tech-stack.md) — why this stack
