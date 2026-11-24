# Tech stack notes

Background for `implementation_spec.md` §2. Summary of why each choice fits a small, real-time,
turn-based multiplayer card/board game for 2–6 players.

## Shape of the problem

- Turn-based, low message rate (a few messages per turn), small state (~2 KB per game).
- Hidden information (hands) → the server must be authoritative and send per-player views.
- Players are on phones and desktops, often on flaky mobile networks → reconnect matters more than latency.
- Private rooms only, no accounts, no persistence in v1 → in-memory state in one process is enough.

## Choices

| Concern   | Choice                                               | Why                                                                                                                                                           |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport | Socket.IO 4                                          | Rooms, acks, automatic reconnect with backoff, and a long-polling fallback for restrictive networks. Plain `ws` would need all of that rebuilt.               |
| Server    | Node `http` + Socket.IO                              | One process serves static files, `/healthz` and sockets; no framework needed. Hosting-agnostic (any VM, container or PaaS that supports WebSockets).          |
| Rules     | Pure TypeScript, JSON state                          | Shared by server (authority) and client (highlighting legal targets); deterministic and trivially testable; state can be logged, replayed or persisted later. |
| RNG       | xoshiro128** with explicit state                     | Deterministic from a seed (tests, E2E), state lives inside `GameState`, never sent to clients.                                                                |
| Schemas   | zod                                                  | Runtime validation of every untrusted payload with inferred TS types shared by both sides.                                                                    |
| Client    | React 19 + Vite                                      | Mature ecosystem, fast dev server and small production bundles.                                                                                               |
| State     | Zustand                                              | Tiny, hook-based store; the server is the source of truth so client state is mostly a cache.                                                                  |
| Styling   | Tailwind CSS v4                                      | Utility classes plus CSS variables for themeable, high-contrast team colours.                                                                                 |
| Animation | Motion (`LazyMotion` + `domAnimation`)               | Declarative enter/exit animations driven by server events; respects reduced motion.                                                                           |
| Tests     | Vitest, fast-check, Testing Library, Playwright, axe | Unit + property tests for rules, socket integration tests for the server, multi-context browser tests for real games.                                         |

## Scaling path (post-v1)

- Persistence: snapshot `GameState` (already plain JSON) to Redis/Postgres on each turn.
- Horizontal scaling: Socket.IO Redis adapter + sticky sessions, or route each room to one process.
- Accounts/ratings: add an auth layer that maps tokens to user ids; the rules package is unaffected.
