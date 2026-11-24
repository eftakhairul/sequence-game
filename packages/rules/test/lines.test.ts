import { describe, expect, it } from 'vitest';
import { apply } from '../src/game.js';
import { detectLines, lockedCells } from '../src/lines.js';
import type { Dir, Line, TeamId } from '../src/types.js';
import { chipsAt, range, setup } from './helpers.js';

const emptyChips = (): (TeamId | null)[] => Array.from({ length: 100 }, () => null);
const withChips = (team: TeamId, cells: number[]) => {
  const c = emptyChips();
  for (const x of cells) c[x] = team;
  return c;
};

describe('line detection (§4.5)', () => {
  const cases: {
    name: string;
    cells: number[];
    place: number;
    existing?: Line[];
    expected: { dir: Dir; cells: number[] }[];
  }[] = [
    {
      name: 'horizontal',
      cells: range(21, 1, 5),
      place: 23,
      expected: [{ dir: 'H', cells: [21, 22, 23, 24, 25] }],
    },
    {
      name: 'vertical',
      cells: range(13, 10, 5),
      place: 53,
      expected: [{ dir: 'V', cells: [13, 23, 33, 43, 53] }],
    },
    {
      name: 'diagonal ↘',
      cells: range(12, 11, 5),
      place: 34,
      expected: [{ dir: 'D1', cells: [12, 23, 34, 45, 56] }],
    },
    {
      name: 'diagonal ↗ (ordered from bottom-left)',
      cells: [61, 52, 43, 34, 25],
      place: 43,
      expected: [{ dir: 'D2', cells: [61, 52, 43, 34, 25] }],
    },
    {
      name: 'line using a corner',
      cells: [1, 2, 3, 4],
      place: 4,
      expected: [{ dir: 'H', cells: [0, 1, 2, 3, 4] }],
    },
    {
      name: 'diagonal line using the corner 99',
      cells: [55, 66, 77, 88],
      place: 66,
      expected: [{ dir: 'D1', cells: [55, 66, 77, 88, 99] }],
    },
    {
      name: 'run of 9 placed in the middle forms 2 lines sharing the middle cell',
      cells: range(10, 1, 9),
      place: 14,
      expected: [
        { dir: 'H', cells: [10, 11, 12, 13, 14] },
        { dir: 'H', cells: [14, 15, 16, 17, 18] },
      ],
    },
    {
      name: 'run of 10 placed at an end forms 1 line (picks the window closest to the start)',
      cells: range(10, 1, 10),
      place: 19,
      expected: [{ dir: 'H', cells: [15, 16, 17, 18, 19] }],
    },
    {
      name: 'run of 10 completed in the middle forms 2 lines',
      cells: range(10, 1, 10),
      place: 15,
      expected: [
        { dir: 'H', cells: [11, 12, 13, 14, 15] },
        { dir: 'H', cells: [15, 16, 17, 18, 19] },
      ],
    },
    {
      name: 'a third same-direction line overlapping 2 cells is rejected',
      cells: range(10, 1, 10),
      place: 19,
      existing: [
        { team: 0, dir: 'H', cells: [10, 11, 12, 13, 14] },
        { team: 0, dir: 'H', cells: [14, 15, 16, 17, 18] },
      ],
      expected: [],
    },
    {
      name: 'extending an existing line by 4 makes a second line sharing one cell',
      cells: range(10, 1, 9),
      place: 18,
      existing: [{ team: 0, dir: 'H', cells: [10, 11, 12, 13, 14] }],
      expected: [{ dir: 'H', cells: [14, 15, 16, 17, 18] }],
    },
    {
      name: 'one placement completes lines in 2 directions',
      cells: [...range(41, 1, 5), ...range(13, 10, 5)],
      place: 43,
      expected: [
        { dir: 'H', cells: [41, 42, 43, 44, 45] },
        { dir: 'V', cells: [13, 23, 33, 43, 53] },
      ],
    },
    {
      name: 'other teams lines do not block a same-direction line',
      cells: range(21, 1, 5),
      place: 25,
      existing: [{ team: 1, dir: 'H', cells: [21, 22, 23, 24, 25] }],
      expected: [{ dir: 'H', cells: [21, 22, 23, 24, 25] }],
    },
    { name: 'four in a row is not a line', cells: range(21, 1, 4), place: 22, expected: [] },
  ];

  for (const tc of cases) {
    it(tc.name, () => {
      const found = detectLines(withChips(0, tc.cells), tc.existing ?? [], 0, tc.place);
      expect(found.map((l) => ({ dir: l.dir, cells: l.cells }))).toEqual(tc.expected);
      for (const l of found) expect(l.team).toBe(0);
    });
  }

  it('does not wrap around the board edge', () => {
    // 17,18,19 then 20,21 are on different rows
    expect(detectLines(withChips(0, [17, 18, 19, 20, 21]), [], 0, 19)).toEqual([]);
  });

  it('lockedCells collects line cells', () => {
    const locked = lockedCells([{ team: 0, dir: 'H', cells: [1, 2, 3, 4, 5] }]);
    expect([...locked].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('locked chips via apply', () => {
  it('cutters cannot remove chips in a completed line', () => {
    const s = setup({
      chips: chipsAt(1, range(21, 1, 5)),
      lines: [{ team: 1, dir: 'H', cells: [21, 22, 23, 24, 25] }],
      hands: [['JH'], ['2S']],
      currentSeat: 0,
    });
    expect(() => apply(s, 0, { type: 'cut', card: 'JH', cell: 23 })).toThrow(/CUT_LOCKED/);
  });
});
