import { describe, expect, it } from 'vitest';
import { BOARD, CORNERS, cellsFor, isCorner, isValidCell } from '../src/board.js';
import { BOARD_SEED } from '../src/boardLayout.js';
import { ALL_CARDS, BOARD_CARDS, isJack } from '../src/cards.js';

describe('board layout invariants (§4.2)', () => {
  it('is a 10×10 grid with null exactly at the 4 corners', () => {
    expect(BOARD).toHaveLength(100);
    expect(CORNERS).toEqual([0, 9, 90, 99]);
    BOARD.forEach((card, i) => {
      expect(card === null).toBe(isCorner(i));
    });
  });

  it('shows each of the 48 non-jack codes exactly twice and no jacks', () => {
    const counts = new Map<string, number>();
    for (const c of BOARD) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
    expect(counts.size).toBe(48);
    for (const c of BOARD_CARDS) expect(counts.get(c)).toBe(2);
    for (const c of BOARD) if (c) expect(isJack(c)).toBe(false);
  });

  it('never puts the two copies in the same row, column or adjacent cells', () => {
    for (const c of BOARD_CARDS) {
      const [a, b] = cellsFor(c) as [number, number];
      const [ra, ca, rb, cb] = [Math.floor(a / 10), a % 10, Math.floor(b / 10), b % 10];
      expect(ra).not.toBe(rb);
      expect(ca).not.toBe(cb);
      expect(Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1).toBe(false);
    }
  });

  it('records the seed that produced it (derived from 0x4C494E45)', () => {
    expect(BOARD_SEED).toBeGreaterThanOrEqual(0x4c494e45);
  });

  it('cellsFor returns [] for jacks and a copy for normal cards', () => {
    for (const c of ALL_CARDS) expect(cellsFor(c)).toHaveLength(isJack(c) ? 0 : 2);
    const cells = cellsFor('2S');
    cells.push(0);
    expect(cellsFor('2S')).toHaveLength(2);
  });

  it('validates cell indices', () => {
    expect(isValidCell(0)).toBe(true);
    expect(isValidCell(99)).toBe(true);
    expect(isValidCell(100)).toBe(false);
    expect(isValidCell(-1)).toBe(false);
    expect(isValidCell(1.5)).toBe(false);
    expect(isValidCell('3')).toBe(false);
  });
});

describe('row/col helpers', () => {
  it('maps indices', async () => {
    const { rowOf, colOf } = await import('../src/board.js');
    expect(rowOf(57)).toBe(5);
    expect(colOf(57)).toBe(7);
  });
});
