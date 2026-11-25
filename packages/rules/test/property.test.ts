import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isCorner } from '../src/board.js';
import { apply, createGame, legalActions, validate } from '../src/game.js';
import type { Action, GameConfig, GameState } from '../src/types.js';

const configs: GameConfig[] = [
  { playerCount: 2, teamCount: 2, turnSeconds: 0 },
  { playerCount: 4, teamCount: 2, turnSeconds: 30 },
  { playerCount: 6, teamCount: 2, turnSeconds: 30 },
  { playerCount: 6, teamCount: 3, turnSeconds: 30 },
];

const u32 = fc.integer({ min: 0, max: 0xffffffff });

function checkInvariants(s: GameState) {
  const total = s.deck.length + s.discard.length + s.hands.reduce((n, h) => n + h.length, 0);
  expect(total).toBe(104);
  expect(s.chips).toHaveLength(100);
  s.chips.forEach((c, i) => {
    if (isCorner(i)) expect(c).toBeNull();
  });
  for (const l of s.lines)
    for (const c of l.cells) if (!isCorner(c)) expect(s.chips[c]).toBe(l.team);
}

describe('property: random legal action sequences', () => {
  it('conserve all 104 cards and keep chips valid', () => {
    fc.assert(
      fc.property(
        fc.tuple(u32, u32, u32, u32),
        fc.constantFrom(...configs),
        fc.array(fc.nat(), { minLength: 1, maxLength: 300 }),
        (seed, cfg, choices) => {
          let s = createGame(cfg, seed);
          checkInvariants(s);
          for (const choice of choices) {
            if (s.status !== 'playing') break;
            const seat = s.currentSeat;
            const actions: Action[] = [...legalActions(s, seat), { type: 'timeout' }];
            const a = actions[choice % actions.length] as Action;
            expect(validate(s, seat, a)).toEqual({ ok: true });
            const before = JSON.stringify(s);
            const next = apply(s, seat, a).state;
            expect(JSON.stringify(s)).toBe(before); // purity
            s = next;
            checkInvariants(s);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
