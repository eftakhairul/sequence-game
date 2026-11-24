# Implementation decisions

Choices made where `implementation_spec.md` was open or ambiguous, and deliberate deviations.
Newest entries at the bottom.

## Tooling and repository

- **Pinned major versions.** TypeScript 5.9, Vite 7, Vitest 3, React 19, React Router 7, zod 4,
  ESLint 9 + typescript-eslint 8, Tailwind CSS 4, Motion 12, Socket.IO 4.8, pino 9. These are stable
  lines matching the spec (which requires TypeScript 5.x).
- **Node version.** Target is Node 24 LTS (`.nvmrc`, Dockerfile, CI). `engines` allows `>=22.12` so
  development also works on Node 22.
- **Workspace package resolution.** Each package's `exports` has a custom `@lineup/source` condition
  pointing at `src/index.ts`, plus `types`/`default` pointing at `dist/`. Typechecking uses
  `customConditions: ["@lineup/source"]` (so `pnpm typecheck` works on a clean clone without a build);
  `tsconfig.build.json` clears it so builds consume the dependency's `dist`. Vite and Vitest resolve
  workspace packages to source through aliases (`vitest.aliases.ts`); `tsx` uses `--conditions`.
- **`pnpm ci` → `pnpm run ci`.** pnpm 10 reserves `pnpm ci` ("not implemented"), so the script exists
  as `ci` but must be invoked with `pnpm run ci`.
- **`pnpm test:e2e` builds first** (`pnpm build && playwright test`) so it always runs against a fresh build.
- **CLAUDE.md wording.** The original project description was rephrased in neutral terms to satisfy
  §0/§12 (no commercial game names anywhere in the repo).

## Rules engine

- **RNG seeding.** `createGame` takes the 4-word xoshiro128** state directly; an all-zero seed (an
  invalid xoshiro state) is replaced by `[1,0,0,0]`. The board generator expands its single 32-bit
  seed `0x4C494E45` (+ retries) into four words with splitmix32. The accepted seed (`0x4C4ACD59`,
  after 98 069 attempts) is committed in `boardLayout.ts` as `BOARD_SEED`.
- **Dealing / drawing** take cards from the end of the `deck` array (`pop`).
- **Discard order.** Stored oldest-first in `GameState.discard`; `viewFor` returns it newest-first as §4.6 requires.
- **Run ordering for tie-breaks (§4.5 step 4).** A run is ordered from the end reached by walking
  against the direction step: left end for H, top for V, top-left for ↘ (D1), and **bottom-left for ↗
  (D2)**. Windows closest to that end win ties.
- **"Every seat skipped consecutively" (draw).** `consecutiveSkips` counts consecutive turns skipped
  because the seat had no legal action (`noMoves`, including afk seats that also cannot act). Any real
  action, a timeout, or an afk-skip of a seat that _could_ act resets it. A draw happens when it
  reaches `playerCount`.
- **afk auto-skip** only happens while at least one non-afk seat can act; if every seat is afk, the
  current seat is not auto-skipped and the turn timer keeps the game moving (it can never loop).
- **Dead-card swap with nothing left to do.** If, after a swap, the player has no legal play, the turn
  is skipped (`turnSkipped: noMoves`) rather than leaving the game stuck.
- **Game end.** When a play wins, the winner does not draw and the turn does not advance.
- **Error precedence** in `validate`: `GAME_OVER` → `NOT_YOUR_TURN` → `CARD_NOT_IN_HAND` → card-type
  errors (`NOT_WILD` for a cutter sent as `play`, `NOT_CUTTER` for a non-cutter sent as `cut`) → cell
  errors. Out-of-range cells give `CELL_MISMATCH` (play) or `CUT_OWN_OR_EMPTY` (cut).
- **Extra exports** beyond §5: `legalActions`, `hasAnyAction`, `isValidConfig`, `detectLines`,
  `lockedCells`, card helpers (`cardName`, `isWild`, …) and RNG helpers. They are used by the server
  tests, the client and property tests.

## Protocol

- `room:state` additionally carries `waiting` (room members without a seat — lobby standers and late
  joiners) and `serverNow`; `game:update` carries `serverNow`. Both let clients render the countdown
  from server time (§9.4) without clock skew.
- Error code `INTERNAL` was added for unexpected server failures and client-side ack timeouts.
- Chat text: control and invisible formatting characters are stripped, then trimmed, before the
  1–300 length check.

## Server

- **Joining the lobby auto-seats** the newcomer in the first empty seat (they can move or stand up).
  Late joiners during a game are added to `waiting` and get no game view.
- **Host transfer.** On an explicit `room:leave` the host role passes immediately. On a disconnect
  (e.g. a page refresh), it passes only if the host is still away after `HOST_GRACE_MS` (30 s), so
  refreshing does not cost the host role. Candidates: lowest-index connected seated player, then any
  connected waiting member.
- **Turn timer** restarts whenever the turn number changes; a dead-card swap does not extend it.
- **Test hooks** (`room:testStart`, `game:testSetState`) may be sent by any member of the room in
  `TEST_MODE`. `TEST_MODE` also allows `turnSeconds` below the normal 10 s minimum (E2E timer test).
- **Room creation limit** is configurable with `ROOM_CREATE_LIMIT` (default 5/min/IP, per §6.4). The
  E2E server raises it because every test player shares `127.0.0.1`.
- **`TRUST_PROXY=1`** (new env var) makes per-IP limits use `X-Forwarded-For` behind nginx/Caddy.
- **`HOST_GRACE_MS`** (new env var) configures the host hand-over grace period.
- **WEB_DIST** relative paths resolve from `apps/server`, not the process cwd, so systemd/Docker can
  start the server from any directory.
- Rate-limited or invalid messages get an ack `{ ok:false, code }` when the client asked for one, and
  an `error` event otherwise (rate limits always also emit `error`).
- Static responses send `nosniff`, `X-Frame-Options: DENY`, a restrictive CSP and long-lived caching
  for hashed `/assets/*`.
- Sessions without sockets or a room are dropped after 24 h idle by the GC sweep.

## Web client

- The Socket.IO instance is exposed as `window.__lineupSocket` so E2E tests can call the test hooks
  and send forced actions (it grants nothing the tab could not already do).
- The room page (re)sends `room:join` on every (re)connect. Joining a room you are already in is
  idempotent, and this also recovers after a server restart.
- Hand selection is stored as an **index** into the hand (`ui.selectedCard`), since hands can hold
  duplicate cards.
- Touch vs mouse is decided per tap from the pointer event's `pointerType`: touch → preview, then
  confirm; mouse/pen/keyboard → immediate.
- Accessible names for board cells and hand cards come from visually hidden text (not `aria-label`)
  so visible labels like "7♥" are not contradicted (axe `label-content-name-mismatch`).
- Only `import type` is used from `@lineup/protocol` in the client, keeping zod out of the bundle
  (initial JS ≈ 137 KB gzip).

## Testing

- **WebKit availability.** CI installs Chromium and WebKit. Where WebKit is not installed,
  `E2E_NO_WEBKIT=1` drops the WebKit project and runs the iPhone 13 profile on Chromium.
- E2E test 6 (timer) uses a 2-second test-only timer instead of clock control, because the timer runs
  on the server.
- Accessibility (`@axe-core/playwright`) runs on the lobby and on the 2- and 6-player game views; no
  serious/critical violations are allowed.
