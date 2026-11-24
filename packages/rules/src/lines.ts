import { BOARD_SIZE, isCorner } from './board.js';
import type { CellIndex, Dir, Line, TeamId } from './types.js';

export const DIRS: readonly Dir[] = ['H', 'V', 'D1', 'D2'];

/** Row/column step for each direction. D1 = ↘, D2 = ↗. */
export const DIR_STEP: Record<Dir, readonly [number, number]> = {
  H: [0, 1],
  V: [1, 0],
  D1: [1, 1],
  D2: [-1, 1],
};

const overlap = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((n, x) => (b.includes(x) ? n + 1 : n), 0);

/** Cells that belong to any completed line (their chips are locked). */
export function lockedCells(lines: readonly Line[]): Set<CellIndex> {
  const set = new Set<CellIndex>();
  for (const l of lines) for (const c of l.cells) set.add(c);
  return set;
}

/**
 * Line detection after `team` placed a chip at `p` (spec §4.5).
 * `chips` must already contain the new chip. Returns the NEW lines only.
 *
 * The run along a direction is ordered starting from the end reached by walking against the
 * direction step (left end for H, top end for V, top-left for ↘, bottom-left for ↗); ties go to
 * windows starting closest to that end.
 */
export function detectLines(
  chips: readonly (TeamId | null)[],
  existing: readonly Line[],
  team: TeamId,
  p: CellIndex,
): Line[] {
  const owned = (r: number, c: number): boolean =>
    r >= 0 &&
    r < BOARD_SIZE &&
    c >= 0 &&
    c < BOARD_SIZE &&
    (isCorner(r * BOARD_SIZE + c) || chips[r * BOARD_SIZE + c] === team);

  const pr = Math.floor(p / BOARD_SIZE);
  const pc = p % BOARD_SIZE;
  const found: Line[] = [];

  for (const dir of DIRS) {
    const [dr, dc] = DIR_STEP[dir];
    let r = pr;
    let c = pc;
    while (owned(r - dr, c - dc)) {
      r -= dr;
      c -= dc;
    }
    const run: CellIndex[] = [];
    while (owned(r, c)) {
      run.push(r * BOARD_SIZE + c);
      r += dr;
      c += dc;
    }
    if (run.length < 5) continue;

    const k = run.indexOf(p);
    const sameDir = existing.filter((l) => l.team === team && l.dir === dir);
    let lastStart = -Infinity;
    for (let i = Math.max(0, k - 4); i <= Math.min(k, run.length - 5); i++) {
      const window = run.slice(i, i + 5);
      if (sameDir.some((l) => overlap(l.cells, window) > 1)) continue;
      // Windows are contiguous: starts ≥4 apart share at most one cell. Greedy from the start
      // end yields the maximum compatible set with the required tie-break.
      if (i - lastStart < 4) continue;
      lastStart = i;
      found.push({ team, dir, cells: window as Line['cells'] });
    }
  }
  return found;
}
