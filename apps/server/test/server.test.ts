import { createGame, legalActions, viewFor, type GameState } from '@lineup/rules';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import {
  call,
  connect,
  lastState,
  lastUpdate,
  startServer,
  waitFor,
  type Client,
} from './helpers.js';

let server: Awaited<ReturnType<typeof startServer>>;
const clients: Client[] = [];
const client = async (token?: string) => {
  const c = await connect(server.url, token);
  clients.push(c);
  return c;
};

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server.close();
});

async function twoPlayerRoom(turnSeconds = 0) {
  const a = await client();
  const b = await client();
  const created = await call<{ code: string }>(a, 'room:create', { name: 'Alice' });
  if (!created.ok) throw new Error('create failed');
  const code = created.code;
  expect(await call(a, 'room:config', { playerCount: 2, turnSeconds })).toEqual({ ok: true });
  expect(await call(b, 'room:join', { code: code.toLowerCase(), name: 'Bob' })).toEqual({
    ok: true,
  });
  return { a, b, code };
}

describe('sessions', () => {
  it('issues a session on first connect and keeps it on reconnect', async () => {
    const a = await client();
    expect(a.playerId).toMatch(/[0-9a-f-]{36}/);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    a.disconnect();
    const again = await client(a.token);
    const res = await call<{ code: string }>(again, 'room:create', { name: 'Zed' });
    expect(res.ok).toBe(true);
    await waitFor(() => again.states.length > 0);
    expect(lastState(again).you).toBe(a.playerId);
  });

  it('gives an unknown token a fresh session', async () => {
    const c = await new Promise<Client>((resolve) => {
      void connect(server.url, 'bogus').then(resolve);
    });
    expect(c).toBeTruthy();
  });
});

describe('rooms', () => {
  it('create → join → seats → start → play', async () => {
    const { a, b, code } = await twoPlayerRoom();
    await waitFor(() => lastState(a).seats.every((s) => s !== null));
    const st = lastState(a);
    expect(st.code).toBe(code);
    expect(st.hostId).toBe(a.playerId);
    expect(st.seats.map((s) => s?.name)).toEqual(['Alice', 'Bob']);
    expect(await call(b, 'room:start')).toEqual({ ok: false, code: 'NOT_HOST' });
    expect(await call(a, 'room:start')).toEqual({ ok: true });
    await waitFor(() => a.updates.length > 0 && b.updates.length > 0);
    const ua = lastUpdate(a);
    const ub = lastUpdate(b);
    expect(ua.view.you).toBe(0);
    expect(ub.view.you).toBe(1);
    expect(ua.view.hand).toHaveLength(7);
    expect(JSON.stringify(ub)).not.toContain(JSON.stringify(ua.view.hand));

    const current = ua.view.currentSeat === 0 ? a : b;
    const other = current === a ? b : a;
    const view = lastUpdate(current).view;
    const card = view.hand.find((c) => c !== 'JH' && c !== 'JS') as string;
    const cell = (await import('@lineup/rules')).legalTargetsFromView(view, card as never)[0];
    expect(await call(other, 'game:action', { type: 'play', card, cell })).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
    expect(await call(current, 'game:action', { type: 'play', card, cell: 0 })).toMatchObject({
      ok: false,
    });
    const before = other.updates.length;
    expect(await call(current, 'game:action', { type: 'play', card, cell })).toEqual({ ok: true });
    await waitFor(() => other.updates.length > before);
    expect(lastUpdate(other).view.chips[cell as number]).not.toBeNull();
    expect(lastUpdate(other).events[0]).toMatchObject({ type: 'chipPlaced', cell });
    expect(lastUpdate(other).view.handCounts).toEqual([7, 7]);
  });

  it('rejects joins to unknown rooms and bad payloads', async () => {
    const a = await client();
    expect(await call(a, 'room:join', { code: 'ZZZZZZ', name: 'A' })).toEqual({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
    expect(await call(a, 'room:join', { code: 'nope', name: 'A' })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(await call(a, 'room:create', { name: '' })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(await call(a, 'room:start')).toEqual({ ok: false, code: 'NOT_IN_ROOM' });
    expect(await call(a, 'game:action', { type: 'timeout' })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
  });

  it('seat changes, config changes and kicks in the lobby', async () => {
    const { a, b } = await twoPlayerRoom();
    expect(await call(a, 'room:config', { playerCount: 4 })).toEqual({ ok: true });
    expect(await call(b, 'room:seat', { seat: 0 })).toEqual({ ok: false, code: 'SEAT_TAKEN' });
    expect(await call(b, 'room:seat', { seat: 3 })).toEqual({ ok: true });
    expect(await call(b, 'room:config', { playerCount: 2 })).toEqual({
      ok: false,
      code: 'NOT_HOST',
    });
    // reducing the player count unseats overflow seats
    expect(await call(a, 'room:config', { playerCount: 2 })).toEqual({ ok: true });
    await waitFor(() => lastState(a).seats.length === 2 && lastState(a).waiting.length === 1);
    expect(lastState(a).waiting[0]?.name).toBe('Bob');
    expect(await call(a, 'room:start')).toEqual({ ok: false, code: 'SEATS_NOT_FILLED' });
    expect(await call(b, 'room:seat', { seat: 1 })).toEqual({ ok: true });
    expect(await call(b, 'room:seat', { seat: null })).toEqual({ ok: true });
    expect(await call(a, 'room:config', { playerCount: 6, teamCount: 3 })).toEqual({ ok: true });
    await waitFor(() => lastState(a).config.teamCount === 3);
    expect(await call(a, 'room:config', { playerCount: 4 })).toEqual({ ok: true });
    await waitFor(() => lastState(a).config.playerCount === 4);
    expect(lastState(a).config.teamCount).toBe(2);
    expect(await call(a, 'room:config', { turnSeconds: 5 })).toEqual({ ok: true }); // TEST_MODE allows short timers
    expect(await call(a, 'room:kick', { playerId: a.playerId })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(await call(a, 'room:kick', { playerId: b.playerId })).toEqual({ ok: true });
    await waitFor(() => b.errors.some((e) => e.code === 'KICKED'));
    await waitFor(() => lastState(a).waiting.length === 0);
    expect(await call(b, 'room:seat', { seat: 1 })).toEqual({ ok: false, code: 'NOT_IN_ROOM' });
  });

  it('rejects short timers outside TEST_MODE', async () => {
    await server.close();
    server = await startServer({ testMode: false });
    const a = await client();
    await call(a, 'room:create', { name: 'A' });
    expect(await call(a, 'room:config', { turnSeconds: 5 })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(await call(a, 'room:testStart', { seed: [1, 2, 3, 4] })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
  });

  it('enforces the 20-socket room limit', async () => {
    const host = await client();
    const created = await call<{ code: string }>(host, 'room:create', { name: 'H' });
    if (!created.ok) throw new Error();
    for (let i = 0; i < 19; i++) {
      const c = await client();
      expect(await call(c, 'room:join', { code: created.code, name: `P${i}` })).toEqual({
        ok: true,
      });
    }
    const late = await client();
    expect(await call(late, 'room:join', { code: created.code, name: 'Late' })).toEqual({
      ok: false,
      code: 'ROOM_FULL',
    });
  });

  it('late joiners wait and get no game view', async () => {
    const { a, code } = await twoPlayerRoom();
    await call(a, 'room:start');
    const late = await client();
    expect(await call(late, 'room:join', { code, name: 'Late' })).toEqual({ ok: true });
    await waitFor(() => late.states.length > 0);
    expect(lastState(late).phase).toBe('playing');
    expect(lastState(late).waiting.map((w) => w.name)).toEqual(['Late']);
    await new Promise((r) => setTimeout(r, 100));
    expect(late.updates).toHaveLength(0);
    expect(await call(late, 'room:seat', { seat: 0 })).toEqual({ ok: false, code: 'WRONG_PHASE' });
  });

  it('chat: broadcast, history, rate limit, sanitising', async () => {
    const { a, b, code } = await twoPlayerRoom();
    const got: string[] = [];
    b.on('chat:message', (m) => got.push(m.text));
    expect(await call(a, 'chat:send', { text: ' hello ' })).toEqual({ ok: true });
    expect(await call(a, 'chat:send', { text: 'again' })).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
    });
    await waitFor(() => got.length === 1);
    expect(got).toEqual(['hello']);
    expect(await call(b, 'chat:send', { text: 'x'.repeat(301) })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
    const c = await client();
    const history = new Promise<unknown[]>((r) => c.on('chat:history', r));
    await call(c, 'room:join', { code, name: 'C' });
    expect((await history).length).toBe(1);
  });
});

describe('game flow', () => {
  it('reconnect restores the same seat and hand', async () => {
    const { a, b } = await twoPlayerRoom();
    await call(a, 'room:start');
    await waitFor(() => b.updates.length > 0);
    const hand = lastUpdate(b).view.hand;
    b.disconnect();
    await waitFor(() => lastState(a).seats[1]?.connected === false);
    const b2 = await client(b.token);
    await waitFor(() => b2.updates.length > 0);
    expect(lastUpdate(b2).view.you).toBe(1);
    expect(lastUpdate(b2).view.hand).toEqual(hand);
    expect(lastUpdate(b2).events).toEqual([]);
    await waitFor(() => lastState(a).seats[1]?.connected === true);
  });

  it('turn timer applies a timeout and marks afk after 3', async () => {
    const { a, b } = await twoPlayerRoom();
    await call(a, 'room:config', { turnSeconds: 1 });
    await call(a, 'room:start');
    await waitFor(() => a.updates.length > 0);
    const first = lastUpdate(a);
    expect(first.turnDeadline).toBeGreaterThan(Date.now());
    const seat = first.view.currentSeat;
    await waitFor(
      () =>
        a.updates.some((u) =>
          u.events.some((e) => e.type === 'turnSkipped' && e.reason === 'timeout'),
        ),
      3000,
    );
    expect(lastUpdate(a).view.currentSeat).toBe(1 - seat);
    expect(b.updates.length).toBeGreaterThan(1);
  });

  it('test hooks: fixed seed and set state; finish and rematch', async () => {
    const { a, b } = await twoPlayerRoom();
    expect(await call(a, 'room:testStart', { seed: [1, 2, 3, 4] })).toEqual({ ok: true });
    await waitFor(() => a.updates.length > 0);
    const expected = createGame({ playerCount: 2, teamCount: 2, turnSeconds: 0 }, [1, 2, 3, 4]);
    expect(lastUpdate(a).view).toEqual(viewFor(expected, 0));

    // near-win: seat 0 (team 0) has a line and 4 in a row; JD completes the second
    const s: GameState = JSON.parse(JSON.stringify(expected));
    s.currentSeat = 0;
    for (const c of [71, 72, 73, 74, 75, 21, 22, 23, 24]) s.chips[c] = 0;
    s.lines = [{ team: 0, dir: 'H', cells: [71, 72, 73, 74, 75] }];
    s.hands[0] = ['JD', ...(s.hands[0] ?? []).slice(1)];
    expect(await call(b, 'game:testSetState', { state: s })).toEqual({ ok: true });
    expect(await call(a, 'game:testSetState', { state: { ...s, chips: [] } })).toMatchObject({
      ok: false,
      code: 'BAD_REQUEST',
    });
    expect(await call(a, 'room:rematch')).toEqual({ ok: false, code: 'WRONG_PHASE' });
    expect(await call(a, 'game:action', { type: 'play', card: 'JD', cell: 25 })).toEqual({
      ok: true,
    });
    await waitFor(() => lastState(b).phase === 'finished');
    expect(lastUpdate(b).view.status).toBe('won');
    expect(lastUpdate(b).view.winner).toBe(0);
    expect(lastUpdate(b).events.map((e) => e.type)).toEqual(['chipPlaced', 'lineMade', 'gameOver']);
    expect(await call(a, 'game:action', { type: 'play', card: 'JD', cell: 26 })).toMatchObject({
      ok: false,
      code: 'WRONG_PHASE',
    });
    expect(await call(b, 'room:rematch')).toEqual({ ok: false, code: 'NOT_HOST' });
    expect(await call(a, 'room:rematch')).toEqual({ ok: true });
    await waitFor(() => lastState(b).phase === 'lobby');
    expect(lastState(b).seats.map((x) => x?.name)).toEqual(['Alice', 'Bob']);
  });

  it('rule errors come back as ack codes', async () => {
    const { a, b } = await twoPlayerRoom();
    await call(a, 'room:testStart', { seed: [9, 9, 9, 9] });
    await waitFor(() => a.updates.length > 0);
    const s: GameState = createGame({ playerCount: 2, teamCount: 2, turnSeconds: 0 }, [9, 9, 9, 9]);
    s.currentSeat = 0;
    s.chips[23] = 1;
    s.lines = [];
    s.hands[0] = ['JH', 'JD', ...(s.hands[0] ?? []).slice(2)];
    await call(a, 'game:testSetState', { state: s });
    expect(await call(a, 'game:action', { type: 'cut', card: 'JH', cell: 24 })).toEqual({
      ok: false,
      code: 'CUT_OWN_OR_EMPTY',
    });
    expect(await call(a, 'game:action', { type: 'play', card: 'JD', cell: 0 })).toEqual({
      ok: false,
      code: 'CORNER',
    });
    expect(legalActions(s, 0).length).toBeGreaterThan(0);
    expect(await call(a, 'game:action', { type: 'cut', card: 'JH', cell: 23 })).toEqual({
      ok: true,
    });
    await waitFor(() => lastUpdate(b).view.chips[23] === null);
  });
});

describe('host transfer and leaving', () => {
  it('passes host to the lowest connected seated player when the host leaves', async () => {
    const { a, b } = await twoPlayerRoom();
    expect(await call(a, 'room:leave')).toEqual({ ok: true });
    await waitFor(() => lastState(b).hostId === b.playerId);
    expect(lastState(b).seats[0]).toBeNull();
  });

  it('passes host after the grace period when the host disconnects', async () => {
    const { a, b } = await twoPlayerRoom();
    a.disconnect();
    await waitFor(() => lastState(b).hostId === b.playerId, 2000);
  });

  it('keeps the seat held when leaving mid-game', async () => {
    const { a, b, code } = await twoPlayerRoom();
    await call(a, 'room:start');
    expect(await call(b, 'room:leave')).toEqual({ ok: true });
    await waitFor(() => lastState(a).seats[1]?.connected === false);
    expect(lastState(a).seats[1]?.name).toBe('Bob');
    expect(await call(b, 'room:join', { code, name: 'Bob' })).toEqual({ ok: true });
    await waitFor(() => b.updates.length > 1 && lastUpdate(b).view.you === 1);
  });

  it('deletes rooms with nobody connected after 10 minutes', async () => {
    const { a, b, code } = await twoPlayerRoom();
    a.disconnect();
    b.disconnect();
    await waitFor(() => server.rooms.get(code)?.emptySince !== null);
    server.sweep(Date.now() + 5 * 60_000);
    expect(server.rooms.has(code)).toBe(true);
    server.sweep(Date.now() + 11 * 60_000);
    expect(server.rooms.has(code)).toBe(false);
  });
});

describe('limits', () => {
  it('rate-limits socket messages (burst 20, 10/s)', async () => {
    const a = await client();
    const results = await Promise.all(Array.from({ length: 30 }, () => call(a, 'room:leave')));
    const limited = results.filter((r) => !r.ok && r.code === 'RATE_LIMITED').length;
    expect(limited).toBeGreaterThanOrEqual(8);
    await waitFor(() => a.errors.some((e) => e.code === 'RATE_LIMITED'));
  });

  it('limits room creation to 5 per minute per IP', async () => {
    const a = await client();
    const codes: unknown[] = [];
    for (let i = 0; i < 6; i++) codes.push(await call(a, 'room:create', { name: 'A' }));
    expect(codes.slice(0, 5).every((r) => (r as { ok: boolean }).ok)).toBe(true);
    expect(codes[5]).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });
});

describe('http', () => {
  it('serves /healthz', async () => {
    const res = await fetch(`${server.url}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('refuses TEST_MODE in production', () => {
    expect(() => loadConfig({ TEST_MODE: '1', NODE_ENV: 'production' })).toThrow(/TEST_MODE/);
    expect(loadConfig({ PORT: '4000' }).port).toBe(4000);
    expect(loadConfig({}).webDist).toMatch(/web[/\\]dist$/);
  });
});

describe('review fixes', () => {
  it('kicked players cannot rejoin the room', async () => {
    const { a, b, code } = await twoPlayerRoom();
    expect(await call(a, 'room:kick', { playerId: b.playerId })).toEqual({ ok: true });
    await waitFor(() => b.errors.some((e) => e.code === 'KICKED'));
    expect(await call(b, 'room:join', { code, name: 'Bob' })).toMatchObject({
      ok: false,
      code: 'KICKED',
    });
    // a reconnect does not re-attach them either
    b.disconnect();
    const b2 = await client(b.token);
    await new Promise((r) => setTimeout(r, 100));
    expect(b2.states).toHaveLength(0);
    expect(lastState(a).waiting).toHaveLength(0);
  });

  it('a room whose host left while nobody was online gets a new host on reconnect', async () => {
    const { a, b } = await twoPlayerRoom();
    b.disconnect();
    await waitFor(() => lastState(a).seats[1]?.connected === false);
    expect(await call(a, 'room:leave')).toEqual({ ok: true });
    const b2 = await client(b.token);
    await waitFor(() => b2.states.length > 0);
    expect(lastState(b2).hostId).toBe(b.playerId);
    expect(await call(b2, 'room:config', { playerCount: 4 })).toEqual({ ok: true });
  });

  it('a host whose grace period expired with nobody online is replaced later', async () => {
    const { a, b } = await twoPlayerRoom();
    b.disconnect();
    await waitFor(() => lastState(a).seats[1]?.connected === false);
    a.disconnect();
    await new Promise((r) => setTimeout(r, 400)); // > hostGraceMs (200)
    const b2 = await client(b.token);
    await waitFor(() => b2.states.length > 0);
    expect(lastState(b2).hostId).toBe(b.playerId);
  });

  it('the 20-socket cap also applies to extra connections of existing members', async () => {
    const { a, code } = await twoPlayerRoom();
    const extra: Client[] = [];
    let full = false;
    for (let i = 0; i < 25 && !full; i++) {
      const c = await client(a.token);
      extra.push(c);
      const res = await call(c, 'room:join', { code, name: 'Alice' });
      if (!res.ok && res.code === 'ROOM_FULL') full = true;
    }
    expect(full).toBe(true);
    const room = server.rooms.get(code);
    const total = [...(room?.sockets.values() ?? [])].reduce((n, s) => n + s.size, 0);
    expect(total).toBeLessThanOrEqual(20);
    // reconnecting with a full room is refused too
    const more = await client(a.token);
    await waitFor(() => more.errors.some((e) => e.code === 'ROOM_FULL'));
  });

  it('uses the last X-Forwarded-For entry when trusting the proxy', async () => {
    await server.close();
    server = await startServer({ trustProxy: true });
    const results = [];
    for (let i = 0; i < 6; i++) {
      // forged first entry, real proxy-added address last
      const c = await connect(server.url, undefined, {
        'x-forwarded-for': `10.9.9.${i}, 203.0.113.7`,
      });
      clients.push(c);
      results.push(await call(c, 'room:create', { name: 'A' }));
    }
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });

  it('answers non-Socket.IO paths that start with /socket.io', async () => {
    const res = await fetch(`${server.url}/socket.iox`, { signal: AbortSignal.timeout(2000) });
    expect(res.status).toBe(404);
  });
});
