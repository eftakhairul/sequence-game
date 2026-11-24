# Implementation Spec — Online Card-Grid Five-in-a-Row Team Game (v1)

Status: ready for implementation · Date: 2026-11-22 · Background: `docs/research/tech-stack.md`

Product decisions confirmed by the owner on 2026-11-22:
- Name stays "Lineup" (placeholder).
- Hand sizes per §4.3; lines to win per §4.3.
- 6-player games: the host picks 2×3 or 3×2.
- Turn timer: 60 s default, host-adjustable.
- On timeout: skip the turn, and mark the player afk after 3 in a row.
- Seats are held when a player leaves mid-game.
- One dead-card swap per turn.
- Late joiners wait for the next round.
- Phones: tap to preview, tap to confirm.

This document is the single source of truth for v1. When it is ambiguous, implementers should pick the simplest behaviour consistent with it and record the choice in `docs/decisions.md`.

---

## 0. Originality constraints (MUST)

This is an **original game** in an existing genre, not a copy of a commercial product.

- **Name:** working title **"Lineup"**. It is defined once as `APP_NAME` in `packages/shared-config` (see §3) so it can be renamed. Never use the name of any existing commercial game in the UI, code identifiers shown to users, metadata, URLs or marketing text.
- **Board layout:** generate our own (§4.2). Do **not** reproduce any published board's card arrangement.
- **Art:** card faces, chips and UI are drawn from scratch (rank + suit glyph, our own palette). No scanned or copied artwork.
- **Rules text:** in-app help is written fresh in our own words.
- **Terminology in UI:** a completed five-in-a-row is a **"line"**. The removal jacks are **"cutter"** cards and the wild jacks are **"wild"** cards.

---

## 1. Goals and scope

### v1 in scope
- Browser game, responsive for phone (portrait and landscape) and desktop.
- Private rooms joined by a 6-character code or a share link `/r/:code`.
- 2, 4 or 6 players:
  - 2 players: 2 teams of 1
  - 4 players: 2 teams of 2
  - 6 players: 2 teams of 3, **or** 3 teams of 2 (host chooses)
- Guest play only. The player picks a display name; there are no accounts.
- Server-authoritative play with hidden hands.
- Reconnect after refresh or network drop.
- Turn timer, in-room chat, rematch.

### v1 out of scope (later phases; do not build)
- Accounts and login
- Database persistence
- Ratings
- Public matchmaking
- Bots
- Spectators
- PWA install
- Native or store wrappers
- Horizontal scaling across more than one server process

Keep the code hosting-agnostic. The server is a plain Node process configured only by environment variables, with no cloud-provider SDKs.

---

## 2. Tech stack (fixed)

| Concern | Choice |
|---|---|
| Runtime | Node.js 24 LTS, ESM only |
| Language | TypeScript 5.x, `strict: true`, `noUncheckedIndexedAccess: true` |
| Monorepo | pnpm workspaces (no Turborepo in v1) |
| Rules engine | Pure TS package, zero runtime dependencies |
| Protocol schemas | zod |
| Server | Node `http` + Socket.IO 4 (no Express unless needed for the static/health route) |
| Client | React 19 + Vite, Tailwind CSS v4, Zustand, Motion (`motion/react`), `socket.io-client`, React Router |
| Unit tests | Vitest; fast-check for property tests |
| E2E tests | Playwright (Chromium + WebKit + one mobile viewport) |
| Lint/format | ESLint (typescript-eslint flat config) + Prettier |

---

## 3. Repository layout

```
/
├─ package.json              # workspace root scripts
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ packages/
│  ├─ rules/                 # pure game logic (no DOM, no Node APIs, no I/O)
│  ├─ protocol/              # zod schemas + TS types for socket events
│  └─ shared-config/         # APP_NAME, limits, defaults (tiny constants module)
├─ apps/
│  ├─ server/                # Socket.IO game server
│  └─ web/                   # React client
├─ e2e/                      # Playwright tests
├─ scripts/
│  └─ generate-board.ts      # one-off board layout generator (§4.2)
└─ docs/
   ├─ research/tech-stack.md
   └─ decisions.md           # implementers log deviations/choices here
```

Dependency direction: `web → protocol, rules, shared-config`; `server → protocol, rules, shared-config`; `protocol → rules (types only), shared-config`; `rules → nothing`.

### Root scripts (must exist and work)
| Command | Effect |
|---|---|
| `pnpm install` | install everything |
| `pnpm dev` | runs server (watch, port 3001) and web (Vite, port 5173, proxies `/socket.io` to 3001) together |
| `pnpm build` | builds all packages and apps |
| `pnpm start` | runs the built server, which also serves `apps/web/dist` as static files |
| `pnpm test` | Vitest across all packages |
| `pnpm test:e2e` | Playwright against a built app |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | as named |

Run a single test with `pnpm --filter @lineup/rules test -- lines.test.ts -t "diagonal"`.
Package names use the `@lineup/*` scope.

---

## 4. Game rules (normative)

### 4.1 Cards
- The game uses two standard 52-card decks, **104 cards** in total.
- Card code is `rank + suit`.
  - rank ∈ `2 3 4 5 6 7 8 9 T J Q K A`
  - suit ∈ `S H D C`
  - e.g. `TH` = ten of hearts.
- Duplicates exist (two copies of each code). Hands, deck and discard are arrays of codes.
- **Wild cards:** `JD`, `JC` (4 in the deck).
- **Cutter cards:** `JH`, `JS` (4 in the deck).

### 4.2 Board
- The board is a 10×10 grid. Cell index is `row * 10 + col`, with row 0 at the top.
- The 4 corners (0, 9, 90, 99) are **free cells**. They have no card and count as occupied by **every** team for line purposes. Chips can never be placed on them.
- The other 96 cells each show one non-jack card. Each of the 48 non-jack codes appears **exactly twice**.
- The layout is a **constant** in `packages/rules/src/boardLayout.ts`, produced once by `scripts/generate-board.ts`:
  - Seeded shuffle with fixed seed `0x4C494E45`.
  - Retry with seed+1 until these constraints hold: the two copies of a code are never in the same row, never in the same column, and never 8-neighbour adjacent.
  - Commit the generated array along with the seed that produced it.
- Tests must assert all the invariants above.

### 4.3 Setup
| Players | Teams | Hand size | Lines to win |
|---|---|---|---|
| 2 | 2×1 | 7 | 2 |
| 4 | 2×2 | 6 | 2 |
| 6 | 2×3 | 5 | 2 |
| 6 | 3×2 | 5 | 1 |

- **Seats** are `0..n-1` in clockwise order. With `t` teams, seat `s` is on team `s % t`, so teams alternate around the table.
- **Dealing:** shuffle the deck with the game RNG and deal hands one card at a time starting at seat 0.
- **First player:** a seat chosen by the RNG (store it in state).
- **Team colours:** team 0 blue ● circle, team 1 green ▲ triangle, team 2 red ■ square. Colour is always paired with the shape.

### 4.4 Turn
On their turn, the current seat performs **exactly one** of these:

1. **Play** a non-jack card: place a team chip on an **empty** cell showing that card.
2. **Play a wild** (`JD`/`JC`): place a team chip on **any empty non-corner** cell.
3. **Play a cutter** (`JH`/`JS`): remove **one opponent chip** that is **not part of a completed line**. Cutters cannot target your own team's chips, empty cells or corners. A cutter places no chip.

After the play:
- The played card goes to the discard pile.
- Line detection runs (§4.5), for plays 1–2 only.
- The win check runs.
- The player draws 1 card.
- The turn passes to `(seat + 1) % n`.

**Dead cards:**
- A non-jack card is **dead** for a player when both board cells showing it are occupied.
- Once per turn, **before** playing, the current player may discard one dead card and draw a replacement. This is a separate action, `discardDead`, and does not end the turn.
- Jacks are never dead.

**Deck exhaustion:**
- When a draw is required and the deck is empty, shuffle the discard pile (except the card just played) into a new deck with the RNG.
- If both the deck and the reshuffleable discard pile are empty, skip the draw.

**No legal move:**
- If the current player has no legal play and no dead card to swap (theoretically possible), their turn is skipped automatically.
- If every seat is skipped consecutively, the game ends in a **draw**.

**Timeout:**
- If the turn timer expires, the server applies a `timeout` action: the turn is skipped and no card is drawn.
- After 3 consecutive timeouts by the same seat, that seat is marked `afk`. Play continues; an afk seat's turns are skipped immediately.
- The seat clears `afk` on its next own action.

### 4.5 Lines
- A **line** is 5 consecutive cells in one of 4 directions: horizontal, vertical, diagonal ↘, diagonal ↗. All 5 cells must hold the team's chip or be corners.
- Completed lines are stored as `{ team, dir, cells: [5 indices] }`.
- Chips in a completed line are **locked**: cutters cannot remove them.
- Two lines of the same team **in the same direction** may share **at most one** cell. Lines in different directions can only intersect at one cell, which is allowed.

**Detection after placing a chip at cell `p` for team `T`, for each direction `d`:**
1. Find the maximal contiguous run through `p` along `d` of cells owned by `T` (corners count).
2. List the 5-windows inside the run that contain `p`.
3. Drop any window that shares more than 1 cell with an existing line of `T` in direction `d`.
4. From the remaining windows, pick the **maximum** set where every pair shares ≤1 cell. At most 2 are possible per direction. Ties go to the windows starting closest to the run's top-left end.
5. Add the chosen windows as new lines.

- One placement may create several lines across directions; all count.
- **Win:** after detection, if team `T` has ≥ `linesToWin` lines, the game ends with `winner = T`.

### 4.6 Visibility
- Every player sees: the board, chips, lines, the discard pile (all cards, newest first), deck count, each seat's hand **count**, current seat, turn deadline, and scores (line counts).
- A player sees **only their own hand**.
- No client ever receives the deck order, other hands, or RNG seed/state.

---

## 5. `packages/rules` API (contract)

The package is pure, deterministic and serializable. State is plain JSON, with no classes, Maps or Dates. All functions are side-effect free; `apply` returns a new state.

```ts
type Suit = 'S'|'H'|'D'|'C';
type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
type Card = `${Rank}${Suit}`;
type Seat = number; type TeamId = 0|1|2; type CellIndex = number; // 0..99
type Dir = 'H'|'V'|'D1'|'D2';

interface GameConfig { playerCount: 2|4|6; teamCount: 2|3; turnSeconds: number /* 0 = no timer */; }
interface Line { team: TeamId; dir: Dir; cells: [CellIndex,CellIndex,CellIndex,CellIndex,CellIndex]; }

interface GameState {
  config: GameConfig;
  rng: { s: [number,number,number,number] };       // xoshiro128** state
  deck: Card[]; discard: Card[]; hands: Card[][];  // hands[seat]
  chips: (TeamId|null)[];                          // length 100; corners always null
  lines: Line[];
  currentSeat: Seat; turn: number;                 // turn increments each completed turn
  deadSwapUsed: boolean;
  consecutiveTimeouts: number[]; afk: boolean[]; consecutiveSkips: number;
  status: 'playing'|'won'|'draw'; winner: TeamId|null;
  log: LoggedAction[];                             // full action log (server-only)
}

type Action =
  | { type: 'play';       card: Card; cell: CellIndex }   // normal card or wild
  | { type: 'cut';        card: Card; cell: CellIndex }   // cutter
  | { type: 'discardDead'; card: Card }
  | { type: 'timeout' };                                 // server-only

type RuleError = 'NOT_YOUR_TURN'|'GAME_OVER'|'CARD_NOT_IN_HAND'|'CELL_NOT_EMPTY'|'CELL_MISMATCH'
  |'CORNER'|'NOT_WILD'|'NOT_CUTTER'|'CUT_OWN_OR_EMPTY'|'CUT_LOCKED'|'NOT_DEAD'|'DEAD_SWAP_USED';

type GameEvent =   // drives client animations
  | { type: 'chipPlaced'; seat: Seat; team: TeamId; card: Card; cell: CellIndex }
  | { type: 'chipCut'; seat: Seat; card: Card; cell: CellIndex; removedTeam: TeamId }
  | { type: 'deadSwapped'; seat: Seat; card: Card }
  | { type: 'lineMade'; line: Line }
  | { type: 'turnSkipped'; seat: Seat; reason: 'timeout'|'afk'|'noMoves' }
  | { type: 'deckReshuffled' }
  | { type: 'gameOver'; status: 'won'|'draw'; winner: TeamId|null };

interface PlayerView {   // what a client receives
  config: GameConfig; you: Seat | null; hand: Card[];
  handCounts: number[]; deckCount: number; discard: Card[];
  chips: (TeamId|null)[]; lines: Line[];
  currentSeat: Seat; turn: number; deadSwapUsed: boolean; afk: boolean[];
  status: GameState['status']; winner: TeamId|null;
}

export const BOARD: readonly (Card|null)[];             // length 100, null at corners
export function teamOf(seat: Seat, cfg: GameConfig): TeamId;
export function rulesFor(cfg: GameConfig): { handSize: number; linesToWin: number };
export function createGame(cfg: GameConfig, seed: [number,number,number,number]): GameState;
export function validate(s: GameState, seat: Seat, a: Action): { ok: true } | { ok: false; error: RuleError };
export function apply(s: GameState, seat: Seat, a: Action): { state: GameState; events: GameEvent[] }; // throws if invalid
export function legalTargets(s: GameState, seat: Seat, card: Card): CellIndex[];  // for UI highlighting
export function isDead(s: GameState, card: Card): boolean;
export function viewFor(s: GameState, seat: Seat): PlayerView;
export function cellsFor(card: Card): CellIndex[];
```

`apply` handles the automatic follow-ups internally: draw, reshuffle, advance the turn, auto-skip afk or no-move seats, and the draw condition. Their results appear in `events`.

### Required tests (`packages/rules`)
- **Board invariants** (§4.2).
- **Card conservation:** `deck + discard + Σhands` always equals 104. This is a property test over random legal action sequences generated by fast-check.
- **Chips:** never on corners; never 2 chips in one cell.
- **Each `RuleError`** is produced by at least one test.
- **Line detection, table-driven:**
  - each of the 4 directions
  - lines using a corner
  - a run of 9 forming 2 lines that share the middle cell
  - a run of 10 forming 2 lines
  - a third same-direction line overlapping 2 cells is rejected
  - one placement completing lines in 2 directions
  - locked chips are immune to cutters
- **Win** at 2 lines (2 teams) and at 1 line (3 teams).
- **Dead cards:** swap allowed once per turn; rejected for live cards and jacks.
- **Reshuffle** when the deck is empty.
- **Timeout / afk** transitions.
- **Draw** when all seats are skipped.
- **`viewFor`** never leaks other hands or the deck. Test this by asserting that the serialized view contains no card code beyond the board, own hand and discard.
- **Coverage:** line + branch coverage ≥ 95% for `packages/rules`.

---

## 6. Server (`apps/server`)

### 6.1 Responsibilities
- Rooms held in memory: `Map<code, Room>`.
- Session identity, Socket.IO transport, timers.
- Apply actions through `rules`, broadcast per-seat views, rate limits.
- Serve the static web build and `GET /healthz`.

**Non-goal:** the server must contain **no game logic**. Every rule check goes through `validate`/`apply`.

### 6.2 Identity
- On first connection the client has no token. The server creates `{ playerId: uuid, token: 32 random bytes base64url }`, stores `token → playerId`, and returns it via `session:init`.
- The client stores the token in `localStorage` and sends it in the Socket.IO handshake `auth.token` on every later connection.
- An unknown or missing token gets a fresh session.
- Tokens are never broadcast.
- Display name: 1–20 chars, trimmed. Allowed characters are Unicode letters, numbers, spaces and `-_.'`. Stored per session; sent on `room:create` and `room:join`.

### 6.3 Room model
```ts
interface Room {
  code: string;                // 6 chars from 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  hostId: string;
  config: GameConfig;
  seats: ({ playerId: string; name: string; connected: boolean } | null)[];
  phase: 'lobby'|'playing'|'finished';
  game: GameState | null;
  turnDeadline: number | null; // epoch ms
  chat: ChatMessage[];         // last 100
  lastActivity: number;
}
```

**Lifecycle**
- **Create:** the creator becomes host and is placed in seat 0. Default config is `{playerCount:4, teamCount:2, turnSeconds:60}`.
- **Lobby:**
  - Anyone in the room may take any empty seat or move to another empty seat.
  - The host may change config while in the lobby. Reducing the player count unseats the overflow seats.
  - The host may kick a seated player.
  - If the host leaves, host passes to the lowest-index connected seated player.
- **Start:** host only, and only when every seat is filled. The server seeds with `crypto.getRandomValues` and calls `createGame`.
- **Playing:**
  - Actions come from `game:action`. The server checks that the socket's player occupies `currentSeat`, then runs `validate` and `apply`.
  - Each seat receives `game:update { view: viewFor(state, seat), events }`.
- **Turn timer:**
  - When `turnSeconds > 0`, set `turnDeadline` and schedule one `setTimeout`.
  - On expiry, apply `{type:'timeout'}` for the current seat.
  - Clear and reschedule the timer after every state change.
- **Finished:** broadcast the final views. The host may send `room:rematch`, which sets phase to `lobby` with the same seats and config. The host may also start directly.
- **Joining mid-game:** players not seated when the game started may join the room but cannot take a seat until the next lobby. They receive no game view; they get a "game in progress" state.
- **Garbage collection:** a sweep every 60 s deletes rooms with no connected sockets for 10 min, and finished rooms idle for 30 min.

**Reconnect**
- On connect with a known token, the server re-attaches the socket to that player's room (if any).
- Marks the seat `connected: true`.
- Emits `room:state` and, if playing, `game:update` with `events: []`.
- A disconnected seat keeps its place indefinitely. The turn timer still applies, so afk handling (§4.4) keeps the game moving.

### 6.4 Limits
- **Socket messages:** a token bucket of 10/s per socket, burst 20. Over the limit, drop the message and send `error {code:'RATE_LIMITED'}`.
- **Room creation:** 5 per minute per IP.
- **Chat:** messages are 1–300 chars, max 1 per second per player. Strip control characters. Render as text only on the client (never as HTML).
- **Room size:** max 20 sockets per room (seated players + waiting joiners).
- **Validation:** every incoming payload is checked by its zod schema. Invalid payloads get `error {code:'BAD_REQUEST'}`.

### 6.5 Config (env)
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | |
| `HOST` | `0.0.0.0` | |
| `WEB_DIST` | `../web/dist` | static files directory |
| `CORS_ORIGIN` | unset | needed only when the web app is served from a different origin |
| `LOG_LEVEL` | `info` | |
| `TEST_MODE` | `0` | `1` enables the test hooks in §8 only |

Logging: structured JSON lines to stdout using pino. Log room create/start/end, errors and rate-limit hits. Never log tokens or hands.

Graceful shutdown on SIGTERM: stop accepting connections, emit `server:shutdown` to clients, exit. In-memory games are lost on restart, which is acceptable in v1.

---

## 7. Protocol (`packages/protocol`)

Every event payload has a zod schema, and both server and client import the types. Client→server calls use Socket.IO **acks** returning `{ ok: true, ... } | { ok: false, code: string, message?: string }`.

| Direction | Event | Payload | Ack / notes |
|---|---|---|---|
| S→C | `session:init` | `{ playerId, token }` | sent on connect when a new session was created |
| C→S | `room:create` | `{ name }` | `{ ok, code }` |
| C→S | `room:join` | `{ code, name }` | `{ ok }` or `ROOM_NOT_FOUND` / `ROOM_FULL` |
| C→S | `room:leave` | `{}` | frees the seat in lobby; during play the seat stays held (disconnected) |
| C→S | `room:seat` | `{ seat: number \| null }` | lobby only; `null` = stand up |
| C→S | `room:config` | `Partial<GameConfig>` | host + lobby only |
| C→S | `room:kick` | `{ playerId }` | host + lobby only |
| C→S | `room:start` | `{}` | host; all seats filled |
| C→S | `room:rematch` | `{}` | host; finished only |
| C→S | `game:action` | `Action` without `timeout` | `{ ok }` or a `RuleError` code |
| C→S | `chat:send` | `{ text }` | |
| S→C | `room:state` | `{ code, hostId, config, seats, phase, you: playerId, turnDeadline }` | sent on any lobby/seat/connection change |
| S→C | `game:update` | `{ view: PlayerView, events: GameEvent[], turnDeadline }` | per seat |
| S→C | `chat:message` | `{ id, playerId, name, text, at }` | |
| S→C | `chat:history` | `ChatMessage[]` | sent on join/reconnect |
| S→C | `error` | `{ code, message? }` | non-ack errors |
| S→C | `server:shutdown` | `{}` | |

Server-side error codes beyond `RuleError`: `BAD_REQUEST`, `RATE_LIMITED`, `ROOM_NOT_FOUND`, `ROOM_FULL`, `NOT_HOST`, `NOT_IN_ROOM`, `WRONG_PHASE`, `SEATS_NOT_FILLED`, `SEAT_TAKEN`.

---

## 8. Test hooks (`TEST_MODE=1` only)

These hooks make E2E tests deterministic. The server must refuse to start with `TEST_MODE=1` when `NODE_ENV=production`.
- `room:testStart { seed: [n,n,n,n] }`: start the game with a fixed seed.
- `game:testSetState { state: GameState }`: replace the room's game state (validated by zod), so tests can set up near-win positions.

---

## 9. Web client (`apps/web`)

### 9.1 Routes
- `/` (Home): name input, persisted in localStorage. Buttons: **Create room**, plus **Join** with a code input.
- `/r/:code` (Room): renders the Lobby, Game or Finished view depending on `phase`. Opening a share link with no stored name prompts for a name first, then auto-joins.
- Unknown room: friendly error with a link home.

### 9.2 State
- **Store:** one Zustand store `{ connection, session, room, game: { view, lastEvents }, chat, ui: { selectedCard } }`.
- **Socket:** a single module that wraps socket creation, connects lazily, and auto-reconnects (Socket.IO default).
- **Connection status:** "Reconnecting…" banner when disconnected.
- **Authority:** the client never mutates game state locally. It sends `game:action` and waits for `game:update`. Highlights for selected cards use `legalTargets` on a reconstructed state.

To keep `legalTargets` usable on the client, `rules` must also export:
```ts
legalTargetsFromView(view: PlayerView, card: Card): CellIndex[];
isDeadFromView(view: PlayerView, card: Card): boolean;
```
Both work from a `PlayerView`. Implement them in `rules` so the logic is shared with the server functions.

### 9.3 Lobby view
- Room code, a big **Copy invite link** button, and a native share sheet via `navigator.share` when available.
- Seat list grouped by team, showing each team's colour and shape. Click an empty seat to sit; there is a "stand up" option.
- **Host controls:**
  - Player count: 2/4/6.
  - Team mode: shown only for 6 players (2×3 or 3×2).
  - Turn timer: off/30/60/90/120 s.
  - Kick button.
  - **Start**, disabled until all seats are filled, with a reason tooltip.
- Chat panel.

### 9.4 Game view
**Layout**
- **Board:** a square CSS Grid sized `min(100vw, 100vh − chrome)`.
  - Portrait: board on top, hand tray fixed at the bottom.
  - Landscape/desktop: board centred, with a side panel for players, chat and log.
- **Cell:** rank and suit glyph, with suit colour red/black and an accessible label. Corners show a star.
- **Chip:** team colour plus shape. Locked chips (in lines) get a ring, and completed lines get a stroke drawn over the cells.
- **Hand tray:** the cards. Jacks have a distinct badge, "Wild" or "Cutter". Dead cards are dimmed with a **Swap** button, shown only on your turn and only if the swap is unused.
- **Status bar:** whose turn, a countdown to `turnDeadline` (from server time; render remaining seconds), deck count, top discard, and scores (lines per team / needed).
- **Players panel:** name, team, hand count, connected dot, afk tag, and a current-turn highlight.

**Interaction**
1. Tap a card. Its legal targets highlight; everything else dims.
2. Tap a highlighted cell to send the action. Tapping the card again deselects it.
3. On touch devices, the first tap on a cell shows a preview chip and the second tap confirms. On mouse devices a single click confirms.
4. Not your turn: cards can be selected to preview targets, but cells are not actionable.

**Animation (Motion)**
- Chip drops in when placed.
- Cutter: the chip fades out.
- Line made: a stroke draws along the line, and the cells pulse.
- Animations run from `events` in `game:update` and respect `prefers-reduced-motion`.

**Accessibility**
- The board is `role="grid"` with roving tabindex; arrow keys move, Enter/Space plays.
- Each cell's `aria-label`, e.g. "7 of hearts, blue circle chip, locked".
- An `aria-live="polite"` region announces turns, plays and lines.
- Hand cards are buttons.

**Finished view**
- Winner banner (or "Draw").
- Final board with the lines highlighted.
- Host **Rematch** button; others see "Waiting for host".

**Help modal:** rules in our own words (§0). Reachable from every screen.

### 9.5 Visual style
- Clean, high-contrast tabletop look.
- Team colours must pass WCAG AA contrast against cell backgrounds in both light and dark themes. Follow the system preference.
- No external font or CDN requests at runtime; bundle everything.
- Initial JS ≤ 200 KB gzip.

---

## 10. E2E tests (`e2e/`, Playwright)

Run against `pnpm build` + `pnpm start` with `TEST_MODE=1`. Use multiple browser contexts, one per player.

1. **2-player game:**
   - Create a room and join via the copied link.
   - Start with a fixed seed.
   - Play several turns via UI clicks.
   - Assert that each player sees only their own hand, and that hand counts update.
2. **Win flow:** set a near-win state through the test hook, play the final card, and assert the winner banner and highlighted lines for both players. Then rematch and go back to the lobby.
3. **Cutter:** remove an opponent chip. Cutting a locked chip is impossible: the cell is not highlighted, and a forced `game:action` returns `CUT_LOCKED`.
4. **Dead card swap.**
5. **Reconnect:** reload one player mid-game and assert that the same seat and hand are restored.
6. **Timer:** with a 30 s timer and Playwright clock control (or a short test-only timer), the turn is skipped on expiry.
7. **6-player, 3 teams:** start the game and confirm team assignment `seat % 3` in the UI.
8. **Mobile viewport** (iPhone 13 profile, WebKit): the board fits without horizontal scroll, and a play works via two-tap confirm.
9. **Security:** assert that a player's received socket frames never contain another seat's hand. Capture frames via `page.on('websocket')`.

---

## 11. Work breakdown for the agent team

Work in this order where arrows show dependencies. Streams B and C can start in parallel once A is done. Each stream lands with its tests green and `pnpm lint typecheck test` passing.

| # | Stream | Depends on | Deliverables / acceptance |
|---|---|---|---|
| A | **Scaffold** | — | Workspace, tsconfigs, ESLint/Prettier, all root scripts runnable (even if empty), `shared-config`, CI script `pnpm ci` = lint + typecheck + test + build. Update `CLAUDE.md` with the real commands. |
| B | **Rules** | A | `scripts/generate-board.ts` + committed `boardLayout.ts`; full §5 API; all §5 tests; ≥95% coverage. **Critical path.** Publish the types early (first PR = types + stubs) so C/D can code against them. |
| C | **Protocol** | A, B types | zod schemas + inferred types for every event in §7; round-trip tests. |
| D | **Server** | B, C | §6 complete; integration tests with `socket.io-client` covering create/join/seat/start/action/reconnect/timeout/rate-limit/host transfer; no rule logic outside `rules`. |
| E | **Web** | C (can mock the socket until D lands) | §9 complete; component tests for Board, Hand, Lobby with Testing Library; a mock-socket storybook-like dev page is optional. |
| F | **E2E + polish** | D, E | §10 suite green on Chromium + WebKit; bundle-size check; accessibility check with `@axe-core/playwright` on Lobby and Game (no serious/critical violations). |

**Conventions**
- Small PR-sized commits per stream.
- No `any` without a justification comment.
- Import shared constants from `shared-config` rather than duplicating them.
- If a stream needs a change to another stream's contract (§5 or §7 types), update this spec section in the same change and note it in `docs/decisions.md`.

---

## 12. Definition of done (v1)

- [ ] `pnpm ci` passes from a clean clone.
- [ ] Two people on different networks can play a full game. Verify by running `pnpm start` behind any HTTPS tunnel; hosting itself is deferred.
- [ ] 2-, 4- and 6-player (both team modes) games are playable end to end.
- [ ] Refreshing mid-game restores the player's seat and hand.
- [ ] No hidden information is present in any client-received payload (E2E test 9).
- [ ] The UI is usable on a 390 px-wide phone in portrait.
- [ ] No commercial game names, layouts or art appear anywhere in the repo or UI.
- [ ] `CLAUDE.md` documents the commands and the architecture summary.
