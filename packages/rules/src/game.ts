import { BOARD, CELL_COUNT, cellsFor, isCorner, isValidCell } from './board.js';
import { fullDeck, isCutter, isJack, isWild } from './cards.js';
import { detectLines, lockedCells } from './lines.js';
import { createRng, randInt, shuffleInPlace } from './rng.js';
import type {
  Action,
  Card,
  CellIndex,
  GameConfig,
  GameEvent,
  GameState,
  Line,
  PlayerView,
  RuleError,
  Seat,
  TeamId,
} from './types.js';

/** Consecutive timeouts after which a seat is marked afk. */
export const AFK_AFTER_TIMEOUTS = 3;

export function teamOf(seat: Seat, cfg: GameConfig): TeamId {
  return (seat % cfg.teamCount) as TeamId;
}

export function rulesFor(cfg: GameConfig): { handSize: number; linesToWin: number } {
  if (cfg.playerCount === 2) return { handSize: 7, linesToWin: 2 };
  if (cfg.playerCount === 4) return { handSize: 6, linesToWin: 2 };
  return { handSize: 5, linesToWin: cfg.teamCount === 3 ? 1 : 2 };
}

export function isValidConfig(cfg: GameConfig): boolean {
  const pcOk = cfg.playerCount === 2 || cfg.playerCount === 4 || cfg.playerCount === 6;
  const tcOk = cfg.teamCount === 2 || (cfg.teamCount === 3 && cfg.playerCount === 6);
  const tsOk = Number.isInteger(cfg.turnSeconds) && cfg.turnSeconds >= 0;
  return pcOk && tcOk && tsOk;
}

export function createGame(cfg: GameConfig, seed: [number, number, number, number]): GameState {
  if (!isValidConfig(cfg)) throw new Error(`Invalid game config: ${JSON.stringify(cfg)}`);
  const n = cfg.playerCount;
  const rng = createRng(seed);
  const deck = shuffleInPlace(rng, fullDeck());
  const hands: Card[][] = Array.from({ length: n }, () => []);
  const { handSize } = rulesFor(cfg);
  for (let i = 0; i < handSize; i++) {
    for (let seat = 0; seat < n; seat++) (hands[seat] as Card[]).push(deck.pop() as Card);
  }
  const currentSeat = randInt(rng, n);
  return {
    config: { ...cfg },
    rng,
    deck,
    discard: [],
    hands,
    chips: Array.from({ length: CELL_COUNT }, () => null),
    lines: [],
    currentSeat,
    turn: 0,
    deadSwapUsed: false,
    consecutiveTimeouts: Array.from({ length: n }, () => 0),
    afk: Array.from({ length: n }, () => false),
    consecutiveSkips: 0,
    status: 'playing',
    winner: null,
    log: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Shared target/dead logic (used by both state- and view-based functions)

function targetsCore(
  chips: readonly (TeamId | null)[],
  lines: readonly Line[],
  team: TeamId | null,
  card: Card,
): CellIndex[] {
  if (isCutter(card)) {
    if (team === null) return [];
    const locked = lockedCells(lines);
    const out: CellIndex[] = [];
    chips.forEach((t, cell) => {
      if (t !== null && t !== team && !locked.has(cell)) out.push(cell);
    });
    return out;
  }
  if (isWild(card)) {
    const out: CellIndex[] = [];
    chips.forEach((t, cell) => {
      if (t === null && !isCorner(cell)) out.push(cell);
    });
    return out;
  }
  return cellsFor(card).filter((cell) => chips[cell] === null);
}

function isDeadCore(chips: readonly (TeamId | null)[], card: Card): boolean {
  if (isJack(card)) return false;
  const cells = cellsFor(card);
  return cells.length > 0 && cells.every((c) => chips[c] !== null);
}

/** Cells `card` could legally target for `seat` (ignores whose turn it is). */
export function legalTargets(s: GameState, seat: Seat, card: Card): CellIndex[] {
  const team = seat >= 0 && seat < s.config.playerCount ? teamOf(seat, s.config) : null;
  return targetsCore(s.chips, s.lines, team, card);
}

export function isDead(s: GameState, card: Card): boolean {
  return isDeadCore(s.chips, card);
}

export function legalTargetsFromView(view: PlayerView, card: Card): CellIndex[] {
  const team = view.you === null ? null : teamOf(view.you, view.config);
  return targetsCore(view.chips, view.lines, team, card);
}

export function isDeadFromView(view: PlayerView, card: Card): boolean {
  return isDeadCore(view.chips, card);
}

/** True when `seat` could do anything on its turn (a play or an available dead-card swap). */
export function hasAnyAction(s: GameState, seat: Seat): boolean {
  const hand = s.hands[seat] ?? [];
  for (const card of hand) {
    if (legalTargets(s, seat, card).length > 0) return true;
    if (!s.deadSwapUsed && isDead(s, card)) return true;
  }
  return false;
}

/** Every legal action for `seat` right now (not including `timeout`). */
export function legalActions(s: GameState, seat: Seat): Action[] {
  if (s.status !== 'playing' || seat !== s.currentSeat) return [];
  const out: Action[] = [];
  const seen = new Set<Card>();
  for (const card of s.hands[seat] ?? []) {
    if (seen.has(card)) continue;
    seen.add(card);
    const type = isCutter(card) ? 'cut' : 'play';
    for (const cell of legalTargets(s, seat, card)) out.push({ type, card, cell });
    if (!s.deadSwapUsed && isDead(s, card)) out.push({ type: 'discardDead', card });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Validation

export function validate(
  s: GameState,
  seat: Seat,
  a: Action,
): { ok: true } | { ok: false; error: RuleError } {
  const fail = (error: RuleError) => ({ ok: false as const, error });
  if (s.status !== 'playing') return fail('GAME_OVER');
  if (seat !== s.currentSeat) return fail('NOT_YOUR_TURN');
  if (a.type === 'timeout') return { ok: true };

  const hand = s.hands[seat] ?? [];
  if (!hand.includes(a.card)) return fail('CARD_NOT_IN_HAND');
  const team = teamOf(seat, s.config);

  switch (a.type) {
    case 'play': {
      if (isCutter(a.card)) return fail('NOT_WILD');
      if (!isValidCell(a.cell)) return fail('CELL_MISMATCH');
      if (isCorner(a.cell)) return fail('CORNER');
      if (s.chips[a.cell] !== null) return fail('CELL_NOT_EMPTY');
      if (!isWild(a.card) && BOARD[a.cell] !== a.card) return fail('CELL_MISMATCH');
      return { ok: true };
    }
    case 'cut': {
      if (!isCutter(a.card)) return fail('NOT_CUTTER');
      if (!isValidCell(a.cell)) return fail('CUT_OWN_OR_EMPTY');
      if (isCorner(a.cell)) return fail('CORNER');
      const t = s.chips[a.cell];
      if (t === null || t === undefined || t === team) return fail('CUT_OWN_OR_EMPTY');
      if (lockedCells(s.lines).has(a.cell)) return fail('CUT_LOCKED');
      return { ok: true };
    }
    case 'discardDead': {
      if (s.deadSwapUsed) return fail('DEAD_SWAP_USED');
      if (!isDead(s, a.card)) return fail('NOT_DEAD');
      return { ok: true };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Apply

function cloneState(s: GameState): GameState {
  return {
    config: { ...s.config },
    rng: { s: [...s.rng.s] },
    deck: [...s.deck],
    discard: [...s.discard],
    hands: s.hands.map((h) => [...h]),
    chips: [...s.chips],
    lines: s.lines.map((l) => ({ ...l, cells: [...l.cells] })),
    currentSeat: s.currentSeat,
    turn: s.turn,
    deadSwapUsed: s.deadSwapUsed,
    consecutiveTimeouts: [...s.consecutiveTimeouts],
    afk: [...s.afk],
    consecutiveSkips: s.consecutiveSkips,
    status: s.status,
    winner: s.winner,
    log: [...s.log],
  };
}

function removeFromHand(hand: Card[], card: Card): void {
  hand.splice(hand.indexOf(card), 1);
}

/** Draws one card for `seat`, reshuffling the discard pile (minus its newest card) if needed. */
function drawCard(s: GameState, seat: Seat, events: GameEvent[]): void {
  if (s.deck.length === 0) {
    if (s.discard.length > 1) {
      const newest = s.discard[s.discard.length - 1] as Card;
      s.deck = shuffleInPlace(s.rng, s.discard.slice(0, -1));
      s.discard = [newest];
      events.push({ type: 'deckReshuffled' });
    } else {
      return; // nothing to draw
    }
  }
  (s.hands[seat] as Card[]).push(s.deck.pop() as Card);
}

function finish(s: GameState, events: GameEvent[], status: 'won' | 'draw', winner: TeamId | null) {
  s.status = status;
  s.winner = winner;
  events.push({ type: 'gameOver', status, winner });
}

/**
 * Ends the current turn and moves to the next seat, auto-skipping seats that cannot act
 * (noMoves) and afk seats, and ending the game in a draw when every seat is skipped in a row.
 */
function advanceTurn(s: GameState, events: GameEvent[]): void {
  const n = s.config.playerCount;
  s.turn += 1;
  s.deadSwapUsed = false;
  s.currentSeat = (s.currentSeat + 1) % n;
  autoSkip(s, events);
}

function autoSkip(s: GameState, events: GameEvent[]): void {
  const n = s.config.playerCount;
  // Bounded: noMoves skips increment consecutiveSkips (draw at n); afk skips only happen while
  // some non-afk seat can act, which we then reach within n steps.
  for (let guard = 0; guard < 2 * n + 1 && s.status === 'playing'; guard++) {
    const seat = s.currentSeat;
    if (!hasAnyAction(s, seat)) {
      events.push({ type: 'turnSkipped', seat, reason: 'noMoves' });
      s.consecutiveSkips += 1;
      if (s.consecutiveSkips >= n) {
        finish(s, events, 'draw', null);
        return;
      }
    } else if (s.afk[seat] && someActiveSeatCanAct(s)) {
      events.push({ type: 'turnSkipped', seat, reason: 'afk' });
      s.consecutiveSkips = 0;
    } else {
      return;
    }
    s.turn += 1;
    s.currentSeat = (seat + 1) % n;
  }
}

function someActiveSeatCanAct(s: GameState): boolean {
  for (let seat = 0; seat < s.config.playerCount; seat++) {
    if (!s.afk[seat] && hasAnyAction(s, seat)) return true;
  }
  return false;
}

/** Applies a validated action. Throws on an invalid action. Returns a NEW state. */
export function apply(
  prev: GameState,
  seat: Seat,
  a: Action,
): { state: GameState; events: GameEvent[] } {
  const v = validate(prev, seat, a);
  if (!v.ok) throw new Error(`Invalid action ${a.type}: ${v.error}`);
  const s = cloneState(prev);
  const events: GameEvent[] = [];
  s.log.push({ seat, turn: s.turn, action: a });

  if (a.type === 'timeout') {
    s.consecutiveTimeouts[seat] = (s.consecutiveTimeouts[seat] ?? 0) + 1;
    if ((s.consecutiveTimeouts[seat] ?? 0) >= AFK_AFTER_TIMEOUTS) s.afk[seat] = true;
    s.consecutiveSkips = 0;
    events.push({ type: 'turnSkipped', seat, reason: 'timeout' });
    advanceTurn(s, events);
    return { state: s, events };
  }

  // Any own action clears afk.
  s.consecutiveTimeouts[seat] = 0;
  s.afk[seat] = false;
  const hand = s.hands[seat] as Card[];
  const team = teamOf(seat, s.config);

  if (a.type === 'discardDead') {
    removeFromHand(hand, a.card);
    s.discard.push(a.card);
    events.push({ type: 'deadSwapped', seat, card: a.card });
    drawCard(s, seat, events);
    s.deadSwapUsed = true;
    // Edge case: after the swap the player may have nothing left to do.
    if (!hasAnyAction(s, seat)) {
      events.push({ type: 'turnSkipped', seat, reason: 'noMoves' });
      s.consecutiveSkips += 1;
      if (s.consecutiveSkips >= s.config.playerCount) finish(s, events, 'draw', null);
      else advanceTurn(s, events);
    }
    return { state: s, events };
  }

  removeFromHand(hand, a.card);
  s.discard.push(a.card);
  s.consecutiveSkips = 0;

  if (a.type === 'cut') {
    const removedTeam = s.chips[a.cell] as TeamId;
    s.chips[a.cell] = null;
    events.push({ type: 'chipCut', seat, card: a.card, cell: a.cell, removedTeam });
  } else {
    s.chips[a.cell] = team;
    events.push({ type: 'chipPlaced', seat, team, card: a.card, cell: a.cell });
    const newLines = detectLines(s.chips, s.lines, team, a.cell);
    for (const line of newLines) {
      s.lines.push(line);
      events.push({ type: 'lineMade', line });
    }
    const count = s.lines.filter((l) => l.team === team).length;
    if (count >= rulesFor(s.config).linesToWin) {
      finish(s, events, 'won', team);
      return { state: s, events };
    }
  }

  drawCard(s, seat, events);
  advanceTurn(s, events);
  return { state: s, events };
}

// ---------------------------------------------------------------------------------------------
// Views

export function viewFor(s: GameState, seat: Seat): PlayerView {
  const seated = Number.isInteger(seat) && seat >= 0 && seat < s.config.playerCount;
  return {
    config: { ...s.config },
    you: seated ? seat : null,
    hand: seated ? [...(s.hands[seat] as Card[])] : [],
    handCounts: s.hands.map((h) => h.length),
    deckCount: s.deck.length,
    discard: [...s.discard].reverse(),
    chips: [...s.chips],
    lines: s.lines.map((l) => ({ ...l, cells: [...l.cells] })),
    currentSeat: s.currentSeat,
    turn: s.turn,
    deadSwapUsed: s.deadSwapUsed,
    afk: [...s.afk],
    status: s.status,
    winner: s.winner,
  };
}
