import { createGame } from '../src/game.js';
import type { Card, GameConfig, GameState, Line, TeamId } from '../src/types.js';

export const CFG2: GameConfig = { playerCount: 2, teamCount: 2, turnSeconds: 0 };
export const CFG4: GameConfig = { playerCount: 4, teamCount: 2, turnSeconds: 60 };
export const CFG6x2: GameConfig = { playerCount: 6, teamCount: 2, turnSeconds: 60 };
export const CFG6x3: GameConfig = { playerCount: 6, teamCount: 3, turnSeconds: 60 };

export interface Setup {
  cfg?: GameConfig;
  chips?: Record<number, TeamId>;
  hands?: Card[][];
  currentSeat?: number;
  lines?: Line[];
  deck?: Card[];
  discard?: Card[];
}

/** A fresh game with selective overrides (does not try to conserve cards). */
export function setup(o: Setup = {}): GameState {
  const s = createGame(o.cfg ?? CFG2, [1, 2, 3, 4]);
  if (o.chips) for (const [cell, team] of Object.entries(o.chips)) s.chips[Number(cell)] = team;
  if (o.hands) s.hands = o.hands.map((h) => [...h]);
  if (o.currentSeat !== undefined) s.currentSeat = o.currentSeat;
  if (o.lines) s.lines = o.lines;
  if (o.deck) s.deck = [...o.deck];
  if (o.discard) s.discard = [...o.discard];
  return s;
}

export const chipsAt = (team: TeamId, cells: number[]): Record<number, TeamId> =>
  Object.fromEntries(cells.map((c) => [c, team]));

export const range = (start: number, step: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => start + i * step);
