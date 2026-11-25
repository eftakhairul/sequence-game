export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Card = `${Rank}${Suit}`;
export type Seat = number;
export type TeamId = 0 | 1 | 2;
/** 0..99, row * 10 + col, row 0 at the top. */
export type CellIndex = number;
/** H = horizontal, V = vertical, D1 = diagonal ↘, D2 = diagonal ↗. */
export type Dir = 'H' | 'V' | 'D1' | 'D2';

export interface GameConfig {
  playerCount: 2 | 4 | 6;
  teamCount: 2 | 3;
  /** 0 = no timer */
  turnSeconds: number;
}

export interface Line {
  team: TeamId;
  dir: Dir;
  cells: [CellIndex, CellIndex, CellIndex, CellIndex, CellIndex];
}

export interface RngState {
  /** xoshiro128** state, four unsigned 32-bit words */
  s: [number, number, number, number];
}

export type Action =
  | { type: 'play'; card: Card; cell: CellIndex }
  | { type: 'cut'; card: Card; cell: CellIndex }
  | { type: 'discardDead'; card: Card }
  | { type: 'timeout' };

export interface LoggedAction {
  seat: Seat;
  turn: number;
  action: Action;
}

export interface GameState {
  config: GameConfig;
  rng: RngState;
  deck: Card[];
  /** Internally stored oldest first; `viewFor` returns it newest first. */
  discard: Card[];
  /** hands[seat] */
  hands: Card[][];
  /** length 100; corners always null */
  chips: (TeamId | null)[];
  lines: Line[];
  currentSeat: Seat;
  /** increments each completed (or skipped) turn */
  turn: number;
  deadSwapUsed: boolean;
  consecutiveTimeouts: number[];
  afk: boolean[];
  consecutiveSkips: number;
  status: 'playing' | 'won' | 'draw';
  winner: TeamId | null;
  /** full action log (server-only) */
  log: LoggedAction[];
}

export type RuleError =
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  | 'CARD_NOT_IN_HAND'
  | 'CELL_NOT_EMPTY'
  | 'CELL_MISMATCH'
  | 'CORNER'
  | 'NOT_WILD'
  | 'NOT_CUTTER'
  | 'CUT_OWN_OR_EMPTY'
  | 'CUT_LOCKED'
  | 'NOT_DEAD'
  | 'DEAD_SWAP_USED';

export type GameEvent =
  | { type: 'chipPlaced'; seat: Seat; team: TeamId; card: Card; cell: CellIndex }
  | { type: 'chipCut'; seat: Seat; card: Card; cell: CellIndex; removedTeam: TeamId }
  | { type: 'deadSwapped'; seat: Seat; card: Card }
  | { type: 'lineMade'; line: Line }
  | { type: 'turnSkipped'; seat: Seat; reason: 'timeout' | 'afk' | 'noMoves' }
  | { type: 'deckReshuffled' }
  | { type: 'gameOver'; status: 'won' | 'draw'; winner: TeamId | null };

export interface PlayerView {
  config: GameConfig;
  you: Seat | null;
  hand: Card[];
  handCounts: number[];
  deckCount: number;
  /** newest first */
  discard: Card[];
  chips: (TeamId | null)[];
  lines: Line[];
  currentSeat: Seat;
  turn: number;
  deadSwapUsed: boolean;
  afk: boolean[];
  status: GameState['status'];
  winner: TeamId | null;
}
