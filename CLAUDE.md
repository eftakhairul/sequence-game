# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Lineup** (working title, defined once as `APP_NAME` in `packages/shared-config`) is an online
card-grid five-in-a-row team board game where 2, 4 or 6 people play together in the browser.
`implementation_spec.md` is the single source of truth for v1; record choices and deviations in
`docs/decisions.md`. Never use the names, board layouts or art of existing commercial games anywhere
in code, UI or docs.

## Commands

```bash
pnpm install          # install everything (pnpm 10 via corepack)
pnpm dev              # server :3001 (tsx watch) + web :5173 (Vite, proxies /socket.io)
pnpm build            # build packages/*/dist, apps/server/dist, apps/web/dist
pnpm start            # run built server (serves apps/web/dist too)
pnpm test             # Vitest in every package (rules: coverage ≥95%)
pnpm test:e2e         # build + Playwright (E2E_NO_WEBKIT=1 if WebKit is not installed)
pnpm lint             # ESLint flat config
pnpm typecheck        # tsc in every package + root (scripts/e2e)
pnpm format           # Prettier
pnpm run ci           # lint + typecheck + test + build (`pnpm ci` is reserved by pnpm)
pnpm check-bundle     # initial JS ≤ 200 KB gzip
pnpm generate-board   # regenerate packages/rules/src/boardLayout.ts
```

Single test: `pnpm --filter @lineup/rules test -- lines.test.ts -t "diagonal"`
(server: `pnpm --filter @lineup/server test -- server.test.ts -t "reconnect"`).

## Architecture

- `packages/rules` — pure, deterministic game engine (no DOM/Node APIs, no deps). State is plain
  JSON. Key API: `createGame`, `validate`, `apply` (returns new state + `GameEvent[]`, handles draw,
  reshuffle, turn advance, afk/no-move skips, draw condition), `viewFor` (per-seat view hiding other
  hands/deck/RNG), `legalTargets(FromView)`, `isDead(FromView)`, `detectLines`. The board layout is a
  generated constant (`boardLayout.ts`).
- `packages/protocol` — zod schemas + TS types for every Socket.IO event (`clientEventSchemas`,
  `ClientToServerEvents`, `ServerToClientEvents`). Client imports types only.
- `packages/shared-config` — constants (APP_NAME, limits, defaults, storage keys).
- `apps/server` — `src/server.ts` holds rooms (`Map<code, Room>`), sessions (token → playerId),
  Socket.IO handlers (zod-validated, ack-based), turn timers, rate limits and GC. **No game logic**:
  every rule goes through `validate`/`apply`. `src/static.ts` serves the SPA; `/healthz` for health.
  `TEST_MODE=1` enables `room:testStart` / `game:testSetState` (refused with `NODE_ENV=production`).
- `apps/web` — React 19 + Vite + Tailwind v4. `src/socket.ts` (single socket, writes into the Zustand
  store in `src/store.ts`), `src/pages/{Home,Room}.tsx`, `src/components/` (Board, Hand, Lobby,
  GameView, StatusBar, PlayersPanel, Chat, HelpModal). The client never mutates game state; it sends
  `game:action` and renders `game:update`.
- Workspace packages resolve to `src/` in dev/tests (custom `@lineup/source` condition / Vite
  aliases in `vitest.aliases.ts`) and to `dist/` in production builds.

## Conventions

- TypeScript strict + `noUncheckedIndexedAccess`; no `any` without a justification comment.
- Import shared constants from `@lineup/shared-config` instead of duplicating them.
- Changing a §5/§7 contract: update the spec section and `docs/decisions.md` in the same change.
- Deployment docs live in `README.md` (systemd + nginx/Caddy, Docker) and `deploy/`.
