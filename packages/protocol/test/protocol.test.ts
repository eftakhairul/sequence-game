import { apply, createGame, legalActions, viewFor } from '@lineup/rules';
import type { GameEvent } from '@lineup/rules';
import { describe, expect, it } from 'vitest';
import {
  ActionSchema,
  ChatSendSchema,
  GameConfigSchema,
  GameEventSchema,
  GameStateSchema,
  GameUpdateSchema,
  NameSchema,
  PartialGameConfigSchema,
  PlayerViewSchema,
  RoomCodeSchema,
  RoomJoinSchema,
  RoomSeatSchema,
  RoomStateSchema,
  clientEventSchemas,
  stripControlChars,
} from '../src/index.js';

const roundTrip = <T>(schema: { parse: (x: unknown) => T }, value: unknown) =>
  schema.parse(JSON.parse(JSON.stringify(value)));

describe('protocol schemas', () => {
  it('round-trips game state, views and events produced by the rules engine', () => {
    let s = createGame({ playerCount: 4, teamCount: 2, turnSeconds: 60 }, [5, 6, 7, 8]);
    const events: GameEvent[] = [];
    for (let i = 0; i < 20 && s.status === 'playing'; i++) {
      const a = legalActions(s, s.currentSeat)[0];
      if (!a) break;
      const r = apply(s, s.currentSeat, a);
      s = r.state;
      events.push(...r.events);
    }
    expect(roundTrip(GameStateSchema, s)).toEqual(s);
    const view = viewFor(s, 1);
    expect(roundTrip(PlayerViewSchema, view)).toEqual(view);
    for (const e of events) expect(roundTrip(GameEventSchema, e)).toEqual(e);
    const update = { view, events, turnDeadline: Date.now() + 1000, serverNow: Date.now() };
    expect(roundTrip(GameUpdateSchema, update)).toEqual(update);
  });

  it('validates every gameplay event kind', () => {
    const samples: GameEvent[] = [
      { type: 'chipPlaced', seat: 0, team: 0, card: '2S', cell: 1 },
      { type: 'chipCut', seat: 1, card: 'JH', cell: 1, removedTeam: 0 },
      { type: 'deadSwapped', seat: 0, card: '2S' },
      { type: 'lineMade', line: { team: 1, dir: 'D2', cells: [61, 52, 43, 34, 25] } },
      { type: 'turnSkipped', seat: 3, reason: 'afk' },
      { type: 'deckReshuffled' },
      { type: 'gameOver', status: 'draw', winner: null },
    ];
    for (const e of samples) expect(GameEventSchema.parse(e)).toEqual(e);
    expect(() =>
      GameEventSchema.parse({ type: 'chipPlaced', seat: 0, team: 4, card: '2S', cell: 1 }),
    ).toThrow();
  });

  it('accepts client actions and rejects bad ones (including timeout)', () => {
    expect(ActionSchema.parse({ type: 'play', card: 'TH', cell: 5 })).toEqual({
      type: 'play',
      card: 'TH',
      cell: 5,
    });
    expect(ActionSchema.parse({ type: 'discardDead', card: '2C' })).toBeTruthy();
    for (const bad of [
      { type: 'timeout' },
      { type: 'play', card: '1H', cell: 5 },
      { type: 'play', card: 'TH', cell: 100 },
      { type: 'cut', card: 'JH', cell: 2.5 },
      { type: 'play', card: 'TH', cell: 5, extra: 1 },
      null,
    ]) {
      expect(ActionSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('validates names', () => {
    expect(NameSchema.parse("  Ana-María_O'Neil ")).toBe("Ana-María_O'Neil");
    expect(NameSchema.parse('张伟 2')).toBe('张伟 2');
    for (const bad of ['', '   ', 'a'.repeat(21), '<script>', 'x@y'])
      expect(NameSchema.safeParse(bad).success).toBe(false);
  });

  it('normalises room codes', () => {
    expect(RoomCodeSchema.parse(' abcdef ')).toBe('ABCDEF');
    for (const bad of ['ABCDE', 'ABCDEFG', 'ABCDE0', 'ABCDEI'])
      expect(RoomCodeSchema.safeParse(bad).success).toBe(false);
    expect(RoomJoinSchema.parse({ code: 'hjk234', name: 'Bo' })).toEqual({
      code: 'HJK234',
      name: 'Bo',
    });
  });

  it('validates configs', () => {
    expect(
      GameConfigSchema.safeParse({ playerCount: 6, teamCount: 3, turnSeconds: 60 }).success,
    ).toBe(true);
    expect(
      GameConfigSchema.safeParse({ playerCount: 4, teamCount: 3, turnSeconds: 60 }).success,
    ).toBe(false);
    expect(
      GameConfigSchema.safeParse({ playerCount: 3, teamCount: 2, turnSeconds: 60 }).success,
    ).toBe(false);
    expect(PartialGameConfigSchema.parse({ turnSeconds: 30 })).toEqual({ turnSeconds: 30 });
    expect(PartialGameConfigSchema.safeParse({ turnSeconds: 30, evil: 1 }).success).toBe(false);
    expect(PartialGameConfigSchema.safeParse({ turnSeconds: 9999 }).success).toBe(false);
  });

  it('strips control characters from chat and enforces length', () => {
    expect(stripControlChars('a\u0000b\u200Bc\n')).toBe('abc');
    expect(ChatSendSchema.parse({ text: ' hi\u0007 there ' })).toEqual({ text: 'hi there' });
    expect(ChatSendSchema.safeParse({ text: '\u0000\u0001' }).success).toBe(false);
    expect(ChatSendSchema.safeParse({ text: 'x'.repeat(301) }).success).toBe(false);
    expect(ChatSendSchema.safeParse({ text: 'x'.repeat(300) }).success).toBe(true);
  });

  it('validates seats and room state', () => {
    expect(RoomSeatSchema.parse({ seat: null })).toEqual({ seat: null });
    expect(RoomSeatSchema.safeParse({ seat: 6 }).success).toBe(false);
    const rs = {
      code: 'ABCDEF',
      hostId: 'p1',
      config: { playerCount: 2, teamCount: 2, turnSeconds: 0 },
      seats: [{ playerId: 'p1', name: 'A', connected: true }, null],
      phase: 'lobby',
      you: 'p1',
      turnDeadline: null,
      waiting: [],
      serverNow: 1,
    };
    expect(roundTrip(RoomStateSchema, rs)).toEqual(rs);
  });

  it('has a schema for every client event', () => {
    expect(Object.keys(clientEventSchemas).sort()).toEqual(
      [
        'chat:send',
        'game:action',
        'game:testSetState',
        'room:config',
        'room:create',
        'room:join',
        'room:kick',
        'room:leave',
        'room:rematch',
        'room:seat',
        'room:start',
        'room:testStart',
      ].sort(),
    );
  });
});
