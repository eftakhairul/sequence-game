import { describe, expect, it } from 'vitest';
import {
  cardName,
  fullDeck,
  isCard,
  isCutter,
  isRedSuit,
  isWild,
  rankLabel,
  suitGlyph,
} from '../src/cards.js';
import { createRng, nextU32, randInt, seedFromNumber, shuffleInPlace } from '../src/rng.js';

describe('cards', () => {
  it('has 104 cards with duplicates', () => {
    const d = fullDeck();
    expect(d).toHaveLength(104);
    expect(d.filter((c) => c === 'TH')).toHaveLength(2);
    expect(d.filter(isWild)).toHaveLength(4);
    expect(d.filter(isCutter)).toHaveLength(4);
  });
  it('describes cards', () => {
    expect(cardName('TH')).toBe('10 of hearts');
    expect(cardName('AS')).toBe('Ace of spades');
    expect(rankLabel('TD')).toBe('10');
    expect(rankLabel('7C')).toBe('7');
    expect(suitGlyph('QD')).toBe('♦');
    expect(isRedSuit('QD')).toBe(true);
    expect(isRedSuit('QC')).toBe(false);
    expect(isCard('QC')).toBe(true);
    expect(isCard('1C')).toBe(false);
    expect(isCard(5)).toBe(false);
  });
});

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng([1, 2, 3, 4]);
    const b = createRng([1, 2, 3, 4]);
    const xs = Array.from({ length: 5 }, () => nextU32(a));
    const ys = Array.from({ length: 5 }, () => nextU32(b));
    expect(xs).toEqual(ys);
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(0);
  });
  it('fixes an all-zero seed', () => {
    const r = createRng([0, 0, 0, 0]);
    expect(r.s).toEqual([1, 0, 0, 0]);
    expect(nextU32(r)).not.toBeNaN();
  });
  it('produces ints in range and permutations', () => {
    const r = createRng(seedFromNumber(42));
    for (let i = 0; i < 1000; i++) {
      const v = randInt(r, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
    const arr = shuffleInPlace(r, [1, 2, 3, 4, 5, 6]);
    expect([...arr].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('seedFromNumber gives 4 distinct words', () => {
    const s = seedFromNumber(0x4c494e45);
    expect(new Set(s).size).toBe(4);
  });
});
