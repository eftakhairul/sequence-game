import { describe, expect, it } from 'vitest';
import { BOARD, cellsFor } from '../src/board.js';
import {
  apply,
  createGame,
  hasAnyAction,
  isDead,
  isDeadFromView,
  isValidConfig,
  legalActions,
  legalTargets,
  legalTargetsFromView,
  rulesFor,
  teamOf,
  validate,
  viewFor,
} from '../src/game.js';
import type { Action, Card, GameState, RuleError } from '../src/types.js';
import { CFG2, CFG4, CFG6x2, CFG6x3, chipsAt, range, setup } from './helpers.js';

const total = (s: GameState) =>
  s.deck.length + s.discard.length + s.hands.reduce((n, h) => n + h.length, 0);

describe('setup (§4.3)', () => {
  it.each([
    [CFG2, 7, 2],
    [CFG4, 6, 2],
    [CFG6x2, 5, 2],
    [CFG6x3, 5, 1],
  ])('%o deals hands of %i and needs %i lines', (cfg, handSize, linesToWin) => {
    expect(rulesFor(cfg)).toEqual({ handSize, linesToWin });
    const s = createGame(cfg, [9, 8, 7, 6]);
    expect(s.hands).toHaveLength(cfg.playerCount);
    for (const h of s.hands) expect(h).toHaveLength(handSize);
    expect(total(s)).toBe(104);
    expect(s.currentSeat).toBeGreaterThanOrEqual(0);
    expect(s.currentSeat).toBeLessThan(cfg.playerCount);
    expect(s.chips.every((c) => c === null)).toBe(true);
    expect(s.status).toBe('playing');
  });

  it('assigns teams alternately (seat % teamCount)', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => teamOf(s, CFG6x3))).toEqual([0, 1, 2, 0, 1, 2]);
    expect([0, 1, 2, 3].map((s) => teamOf(s, CFG4))).toEqual([0, 1, 0, 1]);
  });

  it('is deterministic for a seed', () => {
    expect(createGame(CFG4, [1, 2, 3, 4])).toEqual(createGame(CFG4, [1, 2, 3, 4]));
    expect(createGame(CFG4, [1, 2, 3, 4])).not.toEqual(createGame(CFG4, [1, 2, 3, 5]));
  });

  it('rejects invalid configs', () => {
    expect(isValidConfig({ playerCount: 4, teamCount: 3, turnSeconds: 0 })).toBe(false);
    expect(isValidConfig({ playerCount: 3 as 2, teamCount: 2, turnSeconds: 0 })).toBe(false);
    expect(isValidConfig({ playerCount: 2, teamCount: 2, turnSeconds: -1 })).toBe(false);
    expect(() =>
      createGame({ playerCount: 2, teamCount: 3, turnSeconds: 0 }, [1, 1, 1, 1]),
    ).toThrow();
  });
});

describe('every RuleError', () => {
  const [c1] = cellsFor('5H') as [number];
  const base = () =>
    setup({
      hands: [['5H', 'JD', 'JH', '2S', '3S'], ['4C']],
      currentSeat: 0,
      chips: { ...chipsAt(1, [45]), ...chipsAt(0, [46]), ...chipsAt(1, range(61, 1, 5)) },
      lines: [{ team: 1, dir: 'H', cells: [61, 62, 63, 64, 65] }],
    });
  const cases: [string, (s: GameState) => GameState, number, Action, RuleError][] = [
    ['GAME_OVER', (s) => ({ ...s, status: 'won', winner: 0 }), 0, { type: 'timeout' }, 'GAME_OVER'],
    ['NOT_YOUR_TURN', (s) => s, 1, { type: 'play', card: '4C', cell: 1 }, 'NOT_YOUR_TURN'],
    ['CARD_NOT_IN_HAND', (s) => s, 0, { type: 'play', card: 'KH', cell: 1 }, 'CARD_NOT_IN_HAND'],
    ['CELL_NOT_EMPTY', (s) => s, 0, { type: 'play', card: 'JD', cell: 45 }, 'CELL_NOT_EMPTY'],
    [
      'CELL_MISMATCH',
      (s) => s,
      0,
      { type: 'play', card: '5H', cell: c1 === 1 ? 2 : 1 },
      'CELL_MISMATCH',
    ],
    [
      'CELL_MISMATCH (out of range)',
      (s) => s,
      0,
      { type: 'play', card: 'JD', cell: 100 },
      'CELL_MISMATCH',
    ],
    ['CORNER (play)', (s) => s, 0, { type: 'play', card: 'JD', cell: 0 }, 'CORNER'],
    ['CORNER (cut)', (s) => s, 0, { type: 'cut', card: 'JH', cell: 99 }, 'CORNER'],
    ['NOT_WILD', (s) => s, 0, { type: 'play', card: 'JH', cell: 12 }, 'NOT_WILD'],
    ['NOT_CUTTER', (s) => s, 0, { type: 'cut', card: 'JD', cell: 45 }, 'NOT_CUTTER'],
    [
      'CUT_OWN_OR_EMPTY (own)',
      (s) => s,
      0,
      { type: 'cut', card: 'JH', cell: 46 },
      'CUT_OWN_OR_EMPTY',
    ],
    [
      'CUT_OWN_OR_EMPTY (empty)',
      (s) => s,
      0,
      { type: 'cut', card: 'JH', cell: 12 },
      'CUT_OWN_OR_EMPTY',
    ],
    [
      'CUT_OWN_OR_EMPTY (bad cell)',
      (s) => s,
      0,
      { type: 'cut', card: 'JH', cell: -3 },
      'CUT_OWN_OR_EMPTY',
    ],
    ['CUT_LOCKED', (s) => s, 0, { type: 'cut', card: 'JH', cell: 63 }, 'CUT_LOCKED'],
    ['NOT_DEAD (live)', (s) => s, 0, { type: 'discardDead', card: '5H' }, 'NOT_DEAD'],
    ['NOT_DEAD (jack)', (s) => s, 0, { type: 'discardDead', card: 'JD' }, 'NOT_DEAD'],
    [
      'DEAD_SWAP_USED',
      (s) => ({ ...s, deadSwapUsed: true }),
      0,
      { type: 'discardDead', card: '2S' },
      'DEAD_SWAP_USED',
    ],
  ];
  for (const [name, mod, seat, action, error] of cases) {
    it(name, () => {
      const s = mod(base());
      expect(validate(s, seat, action)).toEqual({ ok: false, error });
      expect(() => apply(s, seat, action)).toThrow(error);
    });
  }
});

describe('plays', () => {
  it('a normal card places a chip on its cell, discards, draws and passes the turn', () => {
    const cell = (cellsFor('7S') as number[])[0] as number;
    const s = setup({ hands: [['7S', '2C'], ['4C']], currentSeat: 0 });
    const deckBefore = s.deck.length;
    const { state, events } = apply(s, 0, { type: 'play', card: '7S', cell });
    expect(state.chips[cell]).toBe(0);
    expect(state.discard.at(-1)).toBe('7S');
    expect(state.hands[0]).toHaveLength(2);
    expect(state.deck).toHaveLength(deckBefore - 1);
    expect(state.currentSeat).toBe(1);
    expect(state.turn).toBe(1);
    expect(events[0]).toEqual({ type: 'chipPlaced', seat: 0, team: 0, card: '7S', cell });
    // original state untouched
    expect(s.chips[cell]).toBeNull();
    expect(s.log).toHaveLength(0);
    expect(state.log).toHaveLength(1);
  });

  it('a wild places anywhere empty except corners', () => {
    const s = setup({ hands: [['JC'], ['4C']], currentSeat: 0, chips: chipsAt(1, [5]) });
    const targets = legalTargets(s, 0, 'JC');
    expect(targets).toHaveLength(100 - 4 - 1);
    expect(targets).not.toContain(0);
    expect(targets).not.toContain(5);
    const { state } = apply(s, 0, { type: 'play', card: 'JC', cell: 55 });
    expect(state.chips[55]).toBe(0);
  });

  it('a cutter removes one unlocked opponent chip and places nothing', () => {
    const s = setup({
      hands: [['JS'], ['4C']],
      currentSeat: 0,
      chips: { ...chipsAt(1, [5, 6]), ...chipsAt(0, [7]) },
    });
    expect(legalTargets(s, 0, 'JS')).toEqual([5, 6]);
    const { state, events } = apply(s, 0, { type: 'cut', card: 'JS', cell: 6 });
    expect(state.chips[6]).toBeNull();
    expect(state.chips[5]).toBe(1);
    expect(events[0]).toEqual({ type: 'chipCut', seat: 0, card: 'JS', cell: 6, removedTeam: 1 });
  });

  it('normal targets exclude occupied cells', () => {
    const [a, b] = cellsFor('9C') as [number, number];
    const s = setup({ chips: chipsAt(1, [a]) });
    expect(legalTargets(s, 0, '9C')).toEqual([b]);
    expect(legalTargets(s, 5, 'JH')).toEqual([]); // not a seat → no team
  });
});

describe('winning', () => {
  it('2 teams: second line wins', () => {
    const cells = range(21, 1, 4); // 21..24, place 25
    const s = setup({
      hands: [[BOARD[25] as Card, '2C'], ['4C']],
      currentSeat: 0,
      chips: { ...chipsAt(0, [...cells, ...range(71, 1, 5)]) },
      lines: [{ team: 0, dir: 'H', cells: [71, 72, 73, 74, 75] }],
    });
    const { state, events } = apply(s, 0, { type: 'play', card: BOARD[25] as Card, cell: 25 });
    expect(state.status).toBe('won');
    expect(state.winner).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['chipPlaced', 'lineMade', 'gameOver']);
    expect(validate(state, state.currentSeat, { type: 'timeout' })).toEqual({
      ok: false,
      error: 'GAME_OVER',
    });
  });

  it('2 teams: a single line does not win', () => {
    const s = setup({
      hands: [[BOARD[25] as Card], ['4C']],
      currentSeat: 0,
      chips: chipsAt(0, range(21, 1, 4)),
    });
    const { state } = apply(s, 0, { type: 'play', card: BOARD[25] as Card, cell: 25 });
    expect(state.status).toBe('playing');
    expect(state.lines).toHaveLength(1);
  });

  it('3 teams: one line wins', () => {
    const hands: Card[][] = [['4C'], ['4C'], ['JD'], ['4C'], ['4C'], ['4C']];
    const s = setup({ cfg: CFG6x3, hands, currentSeat: 2, chips: chipsAt(2, range(21, 10, 4)) });
    const { state } = apply(s, 2, { type: 'play', card: 'JD', cell: 61 });
    expect(state.status).toBe('won');
    expect(state.winner).toBe(2);
  });
});

describe('dead cards', () => {
  const [a, b] = cellsFor('8D') as [number, number];
  it('swap is allowed once per turn and does not end the turn', () => {
    const s = setup({
      hands: [['8D', '8D', 'JD'], ['4C']],
      currentSeat: 0,
      chips: { ...chipsAt(1, [a]), ...chipsAt(0, [b]) },
    });
    expect(isDead(s, '8D')).toBe(true);
    expect(isDead(s, 'JD')).toBe(false);
    const { state, events } = apply(s, 0, { type: 'discardDead', card: '8D' });
    expect(events).toEqual([{ type: 'deadSwapped', seat: 0, card: '8D' }]);
    expect(state.currentSeat).toBe(0);
    expect(state.deadSwapUsed).toBe(true);
    expect(state.hands[0]).toHaveLength(3);
    expect(validate(state, 0, { type: 'discardDead', card: '8D' })).toEqual({
      ok: false,
      error: 'DEAD_SWAP_USED',
    });
    const next = apply(state, 0, { type: 'play', card: 'JD', cell: 50 }).state;
    expect(next.deadSwapUsed).toBe(false);
  });

  it('a card with one free cell is not dead', () => {
    const s = setup({ chips: chipsAt(1, [a]) });
    expect(isDead(s, '8D')).toBe(false);
    expect(isDeadFromView(viewFor(s, 0), '8D')).toBe(false);
  });

  it('if nothing is left to do after the swap, the turn is skipped', () => {
    const s = setup({
      hands: [['8D'], ['JD']],
      currentSeat: 0,
      chips: { ...chipsAt(1, [a]), ...chipsAt(0, [b]) },
      deck: ['8D'],
      discard: [],
    });
    const { state, events } = apply(s, 0, { type: 'discardDead', card: '8D' });
    expect(events.map((e) => e.type)).toEqual(['deadSwapped', 'turnSkipped']);
    expect(state.currentSeat).toBe(1);
  });

  it('a swap leaving nobody able to act ends in a draw', () => {
    const s = setup({
      hands: [['8D'], []],
      currentSeat: 0,
      chips: { ...chipsAt(1, [a]), ...chipsAt(0, [b]) },
      deck: [],
      discard: [],
    });
    s.consecutiveSkips = 1;
    const { state } = apply(s, 0, { type: 'discardDead', card: '8D' });
    expect(state.status).toBe('draw');
  });
});

describe('deck exhaustion', () => {
  it('reshuffles the discard pile except the card just played', () => {
    const s = setup({
      hands: [['JD'], ['4C']],
      currentSeat: 0,
      deck: [],
      discard: ['2S', '3S', '4S'],
    });
    const { state, events } = apply(s, 0, { type: 'play', card: 'JD', cell: 44 });
    expect(events.map((e) => e.type)).toContain('deckReshuffled');
    expect(state.discard).toEqual(['JD']);
    expect(state.deck).toHaveLength(2);
    expect(state.hands[0]).toHaveLength(1);
    expect([...state.deck, ...(state.hands[0] as Card[])].sort()).toEqual(['2S', '3S', '4S']);
  });

  it('skips the draw when nothing can be reshuffled', () => {
    const s = setup({ hands: [['JD', '5C'], ['4C']], currentSeat: 0, deck: [], discard: [] });
    const { state, events } = apply(s, 0, { type: 'play', card: 'JD', cell: 44 });
    expect(state.hands[0]).toEqual(['5C']);
    expect(events.map((e) => e.type)).not.toContain('deckReshuffled');
  });
});

describe('timeout and afk', () => {
  it('a timeout skips the turn without drawing; 3 in a row marks afk; own action clears it', () => {
    let s = setup({
      hands: [
        ['JD', 'JD', 'JD'],
        ['JC', 'JC', 'JC'],
      ],
      currentSeat: 0,
      deck: [],
    });
    const step = (seat: number, a: Action) => {
      const r = apply(s, seat, a);
      s = r.state;
      return r.events;
    };
    expect(step(0, { type: 'timeout' })).toEqual([
      { type: 'turnSkipped', seat: 0, reason: 'timeout' },
    ]);
    expect(s.hands[0]).toHaveLength(3);
    expect(s.currentSeat).toBe(1);
    step(1, { type: 'play', card: 'JC', cell: 11 });
    step(0, { type: 'timeout' });
    step(1, { type: 'play', card: 'JC', cell: 12 });
    step(0, { type: 'timeout' });
    expect(s.afk).toEqual([true, false]);
    expect(s.consecutiveTimeouts[0]).toBe(3);
    // seat 1 plays; seat 0 is afk and is skipped immediately
    const ev = step(1, { type: 'play', card: 'JC', cell: 13 });
    expect(ev).toContainEqual({ type: 'turnSkipped', seat: 0, reason: 'afk' });
    expect(s.currentSeat).toBe(1);
    // seat 1 also goes afk: then no auto-skip happens (all afk) and seat 0 gets the turn
    s = {
      ...s,
      hands: [
        ['JD', 'JD', 'JD'],
        ['JC', 'JC', 'JC'],
      ],
    };
    step(1, { type: 'timeout' });
    expect(s.currentSeat).toBe(1); // seat 0 afk, seat 1 can act → seat 0 skipped again
    step(1, { type: 'timeout' });
    step(1, { type: 'timeout' });
    expect(s.afk).toEqual([true, true]);
    expect(s.currentSeat).toBe(0);
    step(0, { type: 'play', card: 'JD', cell: 20 });
    expect(s.afk[0]).toBe(false);
    expect(s.consecutiveTimeouts[0]).toBe(0);
  });

  it('timeout by a non-current seat is rejected', () => {
    const s = setup({ currentSeat: 0 });
    expect(validate(s, 1, { type: 'timeout' })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
  });
});

describe('no legal move / draw', () => {
  it('skips seats without moves and ends in a draw when every seat is skipped', () => {
    const s = setup({ hands: [['JD'], []], currentSeat: 0, deck: [], discard: [] });
    const { state, events } = apply(s, 0, { type: 'play', card: 'JD', cell: 44 });
    expect(events.filter((e) => e.type === 'turnSkipped')).toEqual([
      { type: 'turnSkipped', seat: 1, reason: 'noMoves' },
      { type: 'turnSkipped', seat: 0, reason: 'noMoves' },
    ]);
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
    expect(events.at(-1)).toEqual({ type: 'gameOver', status: 'draw', winner: null });
  });

  it('skips a seat with no moves and continues', () => {
    const s = setup({ cfg: CFG4, hands: [['JD'], [], ['JC'], ['JC']], currentSeat: 0, deck: [] });
    const { state } = apply(s, 0, { type: 'play', card: 'JD', cell: 44 });
    expect(state.currentSeat).toBe(2);
    expect(state.consecutiveSkips).toBe(1);
    expect(hasAnyAction(state, 1)).toBe(false);
  });

  it('a dead card counts as an available action at turn start', () => {
    const [a, b] = cellsFor('8D') as [number, number];
    const s = setup({ hands: [['8D'], ['JD']], chips: { ...chipsAt(1, [a]), ...chipsAt(0, [b]) } });
    expect(hasAnyAction(s, 0)).toBe(true);
    expect(legalActions(s, 0)).toEqual(
      s.currentSeat === 0 ? [{ type: 'discardDead', card: '8D' }] : [],
    );
  });

  it('legalActions is empty for the wrong seat or a finished game', () => {
    const s = setup({ currentSeat: 0 });
    expect(legalActions(s, 1)).toEqual([]);
    expect(legalActions({ ...s, status: 'draw' }, 0)).toEqual([]);
    expect(legalActions(s, 0).length).toBeGreaterThan(0);
  });
});

describe('viewFor (§4.6)', () => {
  const CODE = /\b[2-9TJQKA][SHDC]\b/g;
  for (const cfg of [CFG2, CFG4, CFG6x2, CFG6x3]) {
    it(`never leaks other hands or the deck (${cfg.playerCount}p/${cfg.teamCount}t)`, () => {
      let s = createGame(cfg, [11, 22, 33, 44]);
      // play a few turns so the discard pile has content
      for (let i = 0; i < 6 && s.status === 'playing'; i++) {
        const a = legalActions(s, s.currentSeat)[0] as Action;
        s = apply(s, s.currentSeat, a).state;
      }
      for (let seat = 0; seat < cfg.playerCount; seat++) {
        const view = viewFor(s, seat);
        const json = JSON.stringify(view);
        const allowed = new Map<string, number>();
        for (const c of [...(s.hands[seat] as Card[]), ...s.discard])
          allowed.set(c, (allowed.get(c) ?? 0) + 1);
        const seen = new Map<string, number>();
        for (const m of json.match(CODE) ?? []) seen.set(m, (seen.get(m) ?? 0) + 1);
        for (const [code, n] of seen) expect(n, code).toBeLessThanOrEqual(allowed.get(code) ?? 0);
        expect(json).not.toContain('rng');
        expect(json).not.toContain('"deck"');
        expect(view.hand).toEqual(s.hands[seat]);
        expect(view.handCounts).toEqual(s.hands.map((h) => h.length));
        expect(view.discard).toEqual([...s.discard].reverse());
        expect(view.you).toBe(seat);
      }
    });
  }

  it('a non-seat gets no hand', () => {
    const s = createGame(CFG2, [1, 1, 1, 1]);
    const v = viewFor(s, -1);
    expect(v.you).toBeNull();
    expect(v.hand).toEqual([]);
    expect(legalTargetsFromView(v, 'JH')).toEqual([]);
    expect(legalTargetsFromView(v, 'JD')).toHaveLength(96);
  });

  it('legalTargetsFromView matches legalTargets', () => {
    const s = setup({ chips: { ...chipsAt(1, [5, 6]), ...chipsAt(0, [7]) } });
    const v = viewFor(s, 0);
    for (const c of ['JH', 'JD', '5H', 'KS'] as Card[])
      expect(legalTargetsFromView(v, c)).toEqual(legalTargets(s, 0, c));
  });
});
