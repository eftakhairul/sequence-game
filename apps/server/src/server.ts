import { randomBytes, randomUUID, getRandomValues } from 'node:crypto';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  clientEventSchemas,
  GameConfigSchema,
  type Ack,
  type ChatMessage,
  type ClientEventName,
  type ClientToServerEvents,
  type ErrorCode,
  type RoomState,
  type SeatInfo,
  type ServerToClientEvents,
} from '@lineup/protocol';
import {
  apply,
  createGame,
  validate,
  viewFor,
  type GameConfig,
  type GameEvent,
  type GameState,
} from '@lineup/rules';
import {
  CHAT_HISTORY_LIMIT,
  CHAT_MIN_INTERVAL_MS,
  DEFAULT_GAME_CONFIG,
  GC_EMPTY_ROOM_MS,
  GC_FINISHED_ROOM_MS,
  GC_SWEEP_INTERVAL_MS,
  MAX_SOCKETS_PER_ROOM,
  MIN_TURN_SECONDS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SOCKET_RATE_BURST,
  SOCKET_RATE_PER_SECOND,
} from '@lineup/shared-config';
import { Server, type Socket } from 'socket.io';
import type { ServerConfig } from './config.js';
import type { Logger } from './logger.js';
import { SlidingWindowLimiter, TokenBucket } from './rateLimit.js';
import { createStaticHandler, SECURITY_HEADERS } from './static.js';

type Phase = 'lobby' | 'playing' | 'finished';

export interface Room {
  code: string;
  hostId: string;
  config: GameConfig;
  seats: (SeatInfo | null)[];
  phase: Phase;
  game: GameState | null;
  turnDeadline: number | null;
  chat: ChatMessage[];
  lastActivity: number;
  /** Everyone in the room (seated or waiting), with their display name. Server-only. */
  members: Map<string, { name: string }>;
  /** Players the host removed; they cannot rejoin this room. Server-only. */
  kicked: Set<string>;
  /** playerId → connected socket ids in this room. Server-only. */
  sockets: Map<string, Set<string>>;
  timer: NodeJS.Timeout | null;
  hostTimer: NodeJS.Timeout | null;
  /** epoch ms since when no socket has been connected (null while someone is connected). */
  emptySince: number | null;
}

interface Session {
  playerId: string;
  token: string;
  name: string | null;
  roomCode: string | null;
  lastSeen: number;
  lastChatAt: number;
}

interface SocketData {
  playerId: string;
  ip: string;
  newSession: boolean;
  bucket: TokenBucket;
}

type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

class ClientError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

const SESSION_IDLE_MS = 24 * 60 * 60_000;
const ioRoom = (code: string) => `room:${code}`;

export interface GameServer {
  http: HttpServer;
  io: IoServer;
  rooms: Map<string, Room>;
  listen(): Promise<void>;
  port(): number;
  close(): Promise<void>;
  /** Runs one garbage-collection sweep (exposed for tests). */
  sweep(now?: number): void;
}

export function createGameServer(config: ServerConfig, log: Logger): GameServer {
  const rooms = new Map<string, Room>();
  const sessionsByToken = new Map<string, Session>();
  const sessionsById = new Map<string, Session>();
  const createLimiter = new SlidingWindowLimiter(config.roomCreatePerMinute, 60_000);

  // ------------------------------------------------------------------------------------------
  // HTTP

  const serveStatic = createStaticHandler(config.webDist);
  const http = createServer((req, res) => {
    if (req.url === '/healthz' || req.url?.startsWith('/healthz?')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }),
      );
      return;
    }
    if (req.url?.startsWith('/socket.io/')) return; // handled by Socket.IO
    if (!serveStatic(req, res)) {
      res.writeHead(405, SECURITY_HEADERS).end();
    }
  });

  const io: IoServer = new Server(http, {
    cors: config.corsOrigin
      ? { origin: config.corsOrigin.split(','), credentials: true }
      : undefined,
    maxHttpBufferSize: 200_000,
    pingInterval: 20_000,
    pingTimeout: 20_000,
  });

  // ------------------------------------------------------------------------------------------
  // Sessions

  function newSession(): Session {
    const s: Session = {
      playerId: randomUUID(),
      token: randomBytes(32).toString('base64url'),
      name: null,
      roomCode: null,
      lastSeen: Date.now(),
      lastChatAt: 0,
    };
    sessionsByToken.set(s.token, s);
    sessionsById.set(s.playerId, s);
    return s;
  }

  function clientIp(socket: IoSocket): string {
    if (config.trustProxy) {
      // The trusted proxy APPENDS the address it saw, so only the last entry is reliable;
      // earlier entries come from the client and can be forged.
      const xff = socket.handshake.headers['x-forwarded-for'];
      const joined = Array.isArray(xff) ? xff.join(',') : xff;
      const last = joined?.split(',').at(-1)?.trim();
      if (last) return last;
    }
    return socket.handshake.address;
  }

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const token = typeof auth?.token === 'string' ? auth.token : undefined;
    let session = token ? sessionsByToken.get(token) : undefined;
    const isNew = !session;
    session ??= newSession();
    session.lastSeen = Date.now();
    socket.data = {
      playerId: session.playerId,
      ip: clientIp(socket),
      newSession: isNew,
      bucket: new TokenBucket(SOCKET_RATE_PER_SECOND, SOCKET_RATE_BURST),
    };
    next();
  });

  // ------------------------------------------------------------------------------------------
  // Room helpers

  function generateCode(): string {
    for (;;) {
      const bytes = randomBytes(ROOM_CODE_LENGTH);
      let code = '';
      for (const b of bytes) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length];
      if (!rooms.has(code)) return code;
    }
  }

  const isConnected = (room: Room, playerId: string) => (room.sockets.get(playerId)?.size ?? 0) > 0;
  const socketCount = (room: Room) => [...room.sockets.values()].reduce((n, s) => n + s.size, 0);
  const seatOf = (room: Room, playerId: string) =>
    room.seats.findIndex((s) => s !== null && s.playerId === playerId);

  function refreshConnected(room: Room): void {
    for (const seat of room.seats) if (seat) seat.connected = isConnected(room, seat.playerId);
    room.emptySince = socketCount(room) === 0 ? (room.emptySince ?? Date.now()) : null;
  }

  function roomStateFor(room: Room, playerId: string): RoomState {
    const seated = new Set(room.seats.filter((s) => s !== null).map((s) => s.playerId));
    return {
      code: room.code,
      hostId: room.hostId,
      config: { ...room.config },
      seats: room.seats.map((s) => (s ? { ...s } : null)),
      phase: room.phase,
      you: playerId,
      turnDeadline: room.turnDeadline,
      waiting: [...room.members.entries()]
        .filter(([id]) => !seated.has(id))
        .map(([id, m]) => ({ playerId: id, name: m.name, connected: isConnected(room, id) })),
      serverNow: Date.now(),
    };
  }

  /**
   * Makes sure the room has a reachable host: if the host is no longer a member, or is
   * disconnected with no grace period pending, the role passes to a connected member. Runs on
   * every state broadcast, so a room whose host left while nobody else was online recovers as
   * soon as someone reconnects.
   */
  function ensureHost(room: Room): void {
    const present = room.members.has(room.hostId) && isConnected(room, room.hostId);
    if (present || (room.members.has(room.hostId) && room.hostTimer)) return;
    pickNewHost(room);
  }

  function emitRoomState(room: Room): void {
    refreshConnected(room);
    ensureHost(room);
    for (const playerId of room.sockets.keys()) {
      for (const sid of room.sockets.get(playerId) ?? []) {
        io.to(sid).emit('room:state', roomStateFor(room, playerId));
      }
    }
  }

  /** Sends each seated player (all of their sockets) their own view. */
  function emitGame(room: Room, events: GameEvent[], onlySocket?: IoSocket): void {
    const game = room.game;
    if (!game) return;
    const now = Date.now();
    const sendTo = (sid: string, seat: number) =>
      io.to(sid).emit('game:update', {
        view: viewFor(game, seat),
        events,
        turnDeadline: room.turnDeadline,
        serverNow: now,
      });
    if (onlySocket) {
      const seat = seatOf(room, onlySocket.data.playerId);
      if (seat >= 0) sendTo(onlySocket.id, seat);
      return;
    }
    room.seats.forEach((s, seat) => {
      if (!s) return;
      for (const sid of room.sockets.get(s.playerId) ?? []) sendTo(sid, seat);
    });
  }

  /** True if `socket` is already in the room or the room has space for one more socket. */
  function hasSocketRoom(room: Room, socket: IoSocket): boolean {
    if (room.sockets.get(socket.data.playerId)?.has(socket.id)) return true;
    return socketCount(room) < MAX_SOCKETS_PER_ROOM;
  }

  function attachSocket(room: Room, socket: IoSocket): void {
    const id = socket.data.playerId;
    let set = room.sockets.get(id);
    if (!set) room.sockets.set(id, (set = new Set()));
    set.add(socket.id);
    void socket.join(ioRoom(room.code));
    room.lastActivity = Date.now();
  }

  function detachPlayer(room: Room, playerId: string): void {
    for (const sid of room.sockets.get(playerId) ?? []) {
      io.sockets.sockets.get(sid)?.leave(ioRoom(room.code));
    }
    room.sockets.delete(playerId);
  }

  function pickNewHost(room: Room): void {
    const candidate =
      room.seats.find(
        (s) => s !== null && s.playerId !== room.hostId && isConnected(room, s.playerId),
      ) ??
      [...room.members.keys()]
        .filter((id) => id !== room.hostId && isConnected(room, id))
        .map((playerId) => ({ playerId }))[0];
    if (candidate) {
      log.info({ room: room.code, from: room.hostId, to: candidate.playerId }, 'host transferred');
      room.hostId = candidate.playerId;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Turn timer

  function clearTimer(room: Room): void {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
  }

  function scheduleTimer(room: Room): void {
    clearTimer(room);
    const game = room.game;
    if (
      room.phase !== 'playing' ||
      !game ||
      game.status !== 'playing' ||
      room.config.turnSeconds <= 0
    ) {
      room.turnDeadline = null;
      return;
    }
    room.turnDeadline = Date.now() + room.config.turnSeconds * 1000;
    const turnAtSchedule = game.turn;
    room.timer = setTimeout(() => {
      room.timer = null;
      const g = room.game;
      if (!g || room.phase !== 'playing' || g.status !== 'playing' || g.turn !== turnAtSchedule)
        return;
      try {
        const res = apply(g, g.currentSeat, { type: 'timeout' });
        commitGame(room, res.state, res.events, true);
      } catch (err) {
        log.error({ err, room: room.code }, 'timeout failed');
      }
    }, room.config.turnSeconds * 1000);
    room.timer.unref?.();
  }

  /** Stores a new game state, updates phase/timer and broadcasts. */
  function commitGame(room: Room, state: GameState, events: GameEvent[], forceTimer = false): void {
    const prevTurn = room.game?.turn;
    room.game = state;
    room.lastActivity = Date.now();
    if (state.status !== 'playing') {
      room.phase = 'finished';
      clearTimer(room);
      room.turnDeadline = null;
      log.info(
        { room: room.code, status: state.status, winner: state.winner, turns: state.turn },
        'game ended',
      );
    } else if (forceTimer || prevTurn !== state.turn || !room.timer) {
      // The deadline restarts whenever the turn changes (not on a dead-card swap).
      scheduleTimer(room);
    }
    emitGame(room, events);
    emitRoomState(room);
  }

  function startGame(room: Room, seed: [number, number, number, number]): void {
    room.game = createGame(room.config, seed);
    room.phase = 'playing';
    log.info({ room: room.code, config: room.config }, 'game started');
    scheduleTimer(room);
    emitGame(room, []);
    emitRoomState(room);
  }

  function deleteRoom(room: Room, reason: string): void {
    clearTimer(room);
    if (room.hostTimer) clearTimeout(room.hostTimer);
    for (const playerId of room.members.keys()) {
      const s = sessionsById.get(playerId);
      if (s?.roomCode === room.code) s.roomCode = null;
    }
    for (const playerId of [...room.sockets.keys()]) detachPlayer(room, playerId);
    rooms.delete(room.code);
    log.info({ room: room.code, reason }, 'room deleted');
  }

  /** Removes the player from their current room (lobby: frees seat; in game: seat is held). */
  function leaveRoom(session: Session, explicit: boolean): void {
    const code = session.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    session.roomCode = null;
    if (!room) return;
    const id = session.playerId;
    detachPlayer(room, id);
    const seat = seatOf(room, id);
    if (room.phase === 'lobby' || seat < 0) {
      if (seat >= 0) room.seats[seat] = null;
      room.members.delete(id);
    }
    if (explicit && room.hostId === id) pickNewHost(room);
    if (room.members.size === 0) {
      deleteRoom(room, 'empty');
      return;
    }
    emitRoomState(room);
  }

  // ------------------------------------------------------------------------------------------
  // Handlers

  type Ctx = { socket: IoSocket; session: Session };
  type Handler<E extends ClientEventName> = (
    payload: ReturnType<(typeof clientEventSchemas)[E]['parse']>,
    ctx: Ctx,
  ) => Ack<object> | Promise<Ack<object>> | void;

  function requireRoom(session: Session): Room {
    const room = session.roomCode ? rooms.get(session.roomCode) : undefined;
    if (!room) throw new ClientError('NOT_IN_ROOM');
    return room;
  }
  function requireHost(room: Room, session: Session): void {
    if (room.hostId !== session.playerId) throw new ClientError('NOT_HOST');
  }
  function requirePhase(room: Room, ...phases: Phase[]): void {
    if (!phases.includes(room.phase)) throw new ClientError('WRONG_PHASE');
  }

  function joinRoom(room: Room, session: Session, socket: IoSocket, name: string): void {
    const id = session.playerId;
    if (room.kicked.has(id))
      throw new ClientError('KICKED', 'The host removed you from this room.');
    // The cap counts sockets, so it applies to extra tabs of existing members too.
    if (!hasSocketRoom(room, socket)) throw new ClientError('ROOM_FULL');
    if (session.roomCode && session.roomCode !== room.code) leaveRoom(session, true);
    session.name = name;
    session.roomCode = room.code;
    room.members.set(id, { name });
    const seat = seatOf(room, id);
    if (seat >= 0) {
      (room.seats[seat] as SeatInfo).name =
        room.phase === 'lobby' ? name : (room.seats[seat] as SeatInfo).name;
    } else if (room.phase === 'lobby') {
      // Convenience: newcomers sit in the first empty seat (they can move or stand up).
      const empty = room.seats.findIndex((s) => s === null);
      if (empty >= 0) room.seats[empty] = { playerId: id, name, connected: true };
    }
    attachSocket(room, socket);
    socket.emit('chat:history', room.chat);
    emitRoomState(room);
    if (room.phase !== 'lobby') emitGame(room, [], socket);
  }

  const handlers: { [E in ClientEventName]: Handler<E> } = {
    'room:create': ({ name }, { socket, session }) => {
      if (!createLimiter.take(socket.data.ip)) {
        log.warn({ ip: socket.data.ip }, 'room create rate limited');
        throw new ClientError('RATE_LIMITED', 'Too many rooms created; wait a minute');
      }
      const code = generateCode();
      const cfg = { ...DEFAULT_GAME_CONFIG };
      const room: Room = {
        code,
        hostId: session.playerId,
        config: cfg,
        seats: Array.from({ length: cfg.playerCount }, () => null),
        phase: 'lobby',
        game: null,
        turnDeadline: null,
        chat: [],
        lastActivity: Date.now(),
        members: new Map(),
        kicked: new Set(),
        sockets: new Map(),
        timer: null,
        hostTimer: null,
        emptySince: null,
      };
      rooms.set(code, room);
      log.info({ room: code }, 'room created');
      joinRoom(room, session, socket, name);
      return { ok: true, code };
    },

    'room:join': ({ code, name }, { socket, session }) => {
      const room = rooms.get(code);
      if (!room) throw new ClientError('ROOM_NOT_FOUND');
      joinRoom(room, session, socket, name);
      return { ok: true };
    },

    'room:leave': (_p, { session }) => {
      requireRoom(session);
      leaveRoom(session, true);
      return { ok: true };
    },

    'room:seat': ({ seat }, { session }) => {
      const room = requireRoom(session);
      requirePhase(room, 'lobby');
      const id = session.playerId;
      const current = seatOf(room, id);
      if (seat === null) {
        if (current >= 0) room.seats[current] = null;
      } else {
        if (seat >= room.config.playerCount) throw new ClientError('BAD_REQUEST', 'No such seat');
        const occupant = room.seats[seat];
        if (occupant && occupant.playerId !== id) throw new ClientError('SEAT_TAKEN');
        if (current >= 0) room.seats[current] = null;
        room.seats[seat] = {
          playerId: id,
          name: room.members.get(id)?.name ?? 'Player',
          connected: true,
        };
      }
      room.lastActivity = Date.now();
      emitRoomState(room);
      return { ok: true };
    },

    'room:config': (patch, { session }) => {
      const room = requireRoom(session);
      requireHost(room, session);
      requirePhase(room, 'lobby');
      const merged = { ...room.config, ...patch };
      if (merged.playerCount !== 6) merged.teamCount = 2;
      if (!config.testMode && merged.turnSeconds > 0 && merged.turnSeconds < MIN_TURN_SECONDS) {
        throw new ClientError(
          'BAD_REQUEST',
          `Turn timer must be 0 or at least ${MIN_TURN_SECONDS}s`,
        );
      }
      const parsed = GameConfigSchema.safeParse(merged);
      if (!parsed.success) throw new ClientError('BAD_REQUEST', 'Invalid config');
      room.config = parsed.data;
      const n = room.config.playerCount;
      // Reducing the player count unseats the overflow seats (they stay in the room).
      room.seats = Array.from({ length: n }, (_, i) => room.seats[i] ?? null);
      room.lastActivity = Date.now();
      emitRoomState(room);
      return { ok: true };
    },

    'room:kick': ({ playerId }, { session }) => {
      const room = requireRoom(session);
      requireHost(room, session);
      requirePhase(room, 'lobby');
      if (playerId === session.playerId || !room.members.has(playerId)) {
        throw new ClientError('BAD_REQUEST', 'Cannot kick that player');
      }
      room.kicked.add(playerId);
      for (const sid of room.sockets.get(playerId) ?? []) {
        io.to(sid).emit('error', {
          code: 'KICKED',
          message: 'The host removed you from this room.',
        });
      }
      const target = sessionsById.get(playerId);
      if (target) leaveRoom(target, false);
      emitRoomState(room);
      return { ok: true };
    },

    'room:start': (_p, { session }) => {
      const room = requireRoom(session);
      requireHost(room, session);
      requirePhase(room, 'lobby', 'finished');
      if (room.seats.some((s) => s === null)) throw new ClientError('SEATS_NOT_FILLED');
      startGame(
        room,
        Array.from(getRandomValues(new Uint32Array(4))) as [number, number, number, number],
      );
      return { ok: true };
    },

    'room:rematch': (_p, { session }) => {
      const room = requireRoom(session);
      requireHost(room, session);
      requirePhase(room, 'finished');
      room.phase = 'lobby';
      room.game = null;
      room.turnDeadline = null;
      clearTimer(room);
      room.lastActivity = Date.now();
      emitRoomState(room);
      return { ok: true };
    },

    'game:action': (action, { session }) => {
      const room = requireRoom(session);
      requirePhase(room, 'playing');
      const game = room.game as GameState;
      const seat = seatOf(room, session.playerId);
      if (seat < 0 || seat !== game.currentSeat) throw new ClientError('NOT_YOUR_TURN');
      const v = validate(game, seat, action);
      if (!v.ok) return { ok: false, code: v.error };
      const res = apply(game, seat, action);
      commitGame(room, res.state, res.events);
      return { ok: true };
    },

    'chat:send': ({ text }, { session }) => {
      const room = requireRoom(session);
      const now = Date.now();
      if (now - session.lastChatAt < CHAT_MIN_INTERVAL_MS) {
        throw new ClientError('RATE_LIMITED', 'One message per second');
      }
      session.lastChatAt = now;
      const msg: ChatMessage = {
        id: randomUUID(),
        playerId: session.playerId,
        name: room.members.get(session.playerId)?.name ?? session.name ?? 'Player',
        text,
        at: now,
      };
      room.chat.push(msg);
      if (room.chat.length > CHAT_HISTORY_LIMIT)
        room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);
      room.lastActivity = now;
      io.to(ioRoom(room.code)).emit('chat:message', msg);
      return { ok: true };
    },

    'room:testStart': ({ seed }, { session }) => {
      if (!config.testMode) throw new ClientError('BAD_REQUEST', 'Test hooks are disabled');
      const room = requireRoom(session);
      requirePhase(room, 'lobby', 'finished');
      if (room.seats.some((s) => s === null)) throw new ClientError('SEATS_NOT_FILLED');
      startGame(room, seed);
      return { ok: true };
    },

    'game:testSetState': ({ state }, { session }) => {
      if (!config.testMode) throw new ClientError('BAD_REQUEST', 'Test hooks are disabled');
      const room = requireRoom(session);
      requirePhase(room, 'playing');
      if (
        state.config.playerCount !== room.config.playerCount ||
        state.hands.length !== state.config.playerCount
      ) {
        throw new ClientError('BAD_REQUEST', 'State does not match the room');
      }
      room.config = { ...state.config };
      commitGame(room, state, [], true);
      return { ok: true };
    },
  };

  // ------------------------------------------------------------------------------------------
  // Connection

  io.on('connection', (socket: IoSocket) => {
    const session = sessionsById.get(socket.data.playerId) as Session;
    if (socket.data.newSession) {
      socket.emit('session:init', { playerId: session.playerId, token: session.token });
    }

    // Per-socket token bucket. Over the limit: drop, ack with an error, and send `error`.
    socket.use((packet, next) => {
      if (socket.data.bucket.take()) return next();
      log.warn({ playerId: session.playerId, event: packet[0] }, 'socket rate limited');
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') (ack as (r: Ack) => void)({ ok: false, code: 'RATE_LIMITED' });
      socket.emit('error', { code: 'RATE_LIMITED' });
    });

    for (const name of Object.keys(handlers) as ClientEventName[]) {
      socket.on(name, async (...args: unknown[]) => {
        const maybeAck = args[args.length - 1];
        const ack = typeof maybeAck === 'function' ? (maybeAck as (r: Ack) => void) : undefined;
        const payload = ack && args.length === 1 ? undefined : args[0];
        const reply = (r: Ack) => {
          if (ack) ack(r);
          else if (!r.ok) socket.emit('error', { code: r.code, message: r.message });
        };
        const parsed = clientEventSchemas[name].safeParse(payload ?? {});
        if (!parsed.success) {
          reply({ ok: false, code: 'BAD_REQUEST', message: parsed.error.issues[0]?.message });
          return;
        }
        session.lastSeen = Date.now();
        try {
          const handler = handlers[name] as Handler<typeof name>;
          const res = await handler(parsed.data as never, { socket, session });
          reply(res ?? { ok: true });
        } catch (err) {
          if (err instanceof ClientError) {
            reply({
              ok: false,
              code: err.code,
              message: err.message === err.code ? undefined : err.message,
            });
          } else {
            log.error({ err, event: name }, 'handler failed');
            reply({ ok: false, code: 'INTERNAL' });
          }
        }
      });
    }

    // Reconnect: re-attach to the player's room.
    const room = session.roomCode ? rooms.get(session.roomCode) : undefined;
    if (room && room.members.has(session.playerId) && !hasSocketRoom(room, socket)) {
      socket.emit('error', { code: 'ROOM_FULL', message: 'Too many connections to this room.' });
    } else if (room && room.members.has(session.playerId)) {
      attachSocket(room, socket);
      if (room.hostTimer && room.hostId === session.playerId) {
        clearTimeout(room.hostTimer);
        room.hostTimer = null;
      }
      socket.emit('chat:history', room.chat);
      emitRoomState(room);
      if (room.phase !== 'lobby') emitGame(room, [], socket);
    } else if (session.roomCode) {
      session.roomCode = null;
    }

    socket.on('disconnect', () => {
      session.lastSeen = Date.now();
      const r = session.roomCode ? rooms.get(session.roomCode) : undefined;
      if (!r) return;
      r.sockets.get(session.playerId)?.delete(socket.id);
      if (r.sockets.get(session.playerId)?.size === 0) r.sockets.delete(session.playerId);
      // If the host stays away, the host role passes on after a grace period.
      if (r.hostId === session.playerId && !isConnected(r, session.playerId) && !r.hostTimer) {
        r.hostTimer = setTimeout(() => {
          r.hostTimer = null;
          if (
            rooms.has(r.code) &&
            r.hostId === session.playerId &&
            !isConnected(r, session.playerId)
          ) {
            pickNewHost(r);
            emitRoomState(r);
          }
        }, config.hostGraceMs);
        r.hostTimer.unref?.();
      }
      emitRoomState(r);
    });
  });

  // ------------------------------------------------------------------------------------------
  // Garbage collection

  function sweep(now = Date.now()): void {
    for (const room of [...rooms.values()]) {
      refreshConnected(room);
      if (room.emptySince !== null && now - room.emptySince >= GC_EMPTY_ROOM_MS) {
        deleteRoom(room, 'no connected sockets');
      } else if (room.phase === 'finished' && now - room.lastActivity >= GC_FINISHED_ROOM_MS) {
        deleteRoom(room, 'finished and idle');
      }
    }
    for (const s of [...sessionsById.values()]) {
      const live = [...io.sockets.sockets.values()].some(
        (sock) => sock.data.playerId === s.playerId,
      );
      if (!live && !s.roomCode && now - s.lastSeen > SESSION_IDLE_MS) {
        sessionsById.delete(s.playerId);
        sessionsByToken.delete(s.token);
      }
    }
    createLimiter.sweep();
  }
  const gcTimer = setInterval(() => sweep(), GC_SWEEP_INTERVAL_MS);
  gcTimer.unref();

  // ------------------------------------------------------------------------------------------

  return {
    http,
    io,
    rooms,
    sweep,
    listen: () =>
      new Promise<void>((resolve, reject) => {
        http.once('error', reject);
        http.listen(config.port, config.host, () => resolve());
      }),
    port: () => (http.address() as AddressInfo | null)?.port ?? config.port,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(gcTimer);
        for (const room of rooms.values()) {
          clearTimer(room);
          if (room.hostTimer) clearTimeout(room.hostTimer);
        }
        io.emit('server:shutdown', {});
        // Give the shutdown notice a moment to flush before closing transports.
        setTimeout(() => {
          void io.close(() => resolve());
        }, 100);
      }),
  };
}
