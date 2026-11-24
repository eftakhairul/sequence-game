import type {
  Ack,
  ClientToServerEvents,
  GameUpdate,
  RoomState,
  ServerToClientEvents,
} from '@lineup/protocol';
import { io as ioc, type Socket } from 'socket.io-client';
import { pino } from 'pino';
import type { ServerConfig } from '../src/config.js';
import { createGameServer, type GameServer } from '../src/server.js';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents> & {
  token: string;
  playerId: string;
  states: RoomState[];
  updates: GameUpdate[];
  errors: { code: string }[];
};

export async function startServer(
  overrides: Partial<ServerConfig> = {},
): Promise<GameServer & { url: string }> {
  const config: ServerConfig = {
    port: 0,
    host: '127.0.0.1',
    webDist: '/nonexistent',
    corsOrigin: undefined,
    logLevel: 'silent',
    testMode: true,
    trustProxy: false,
    hostGraceMs: 200,
    roomCreatePerMinute: 5,
    ...overrides,
  };
  const server = createGameServer(config, pino({ level: 'silent' }));
  await server.listen();
  return Object.assign(server, { url: `http://127.0.0.1:${server.port()}` });
}

export function connect(url: string, token?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    const socket = ioc(url, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    }) as Client;
    socket.states = [];
    socket.updates = [];
    socket.errors = [];
    socket.token = token ?? '';
    socket.on('room:state', (s) => socket.states.push(s));
    socket.on('game:update', (u) => socket.updates.push(u));
    socket.on('error', (e) => socket.errors.push(e));
    socket.on('session:init', ({ playerId, token: t }) => {
      socket.playerId = playerId;
      socket.token = t;
      resolve(socket);
    });
    socket.on('connect', () => {
      if (token) {
        // Known token: no session:init; wait for the first room:state or settle shortly.
        setTimeout(() => resolve(socket), 100);
      }
    });
    socket.on('connect_error', reject);
  });
}

type LooseEmit = (event: string, payload: unknown, ack: (res: unknown) => void) => void;

/** Emits an event with an ack. Payloads are intentionally untyped so tests can send bad input. */
export function call<T extends object = object>(
  c: Client,
  event: keyof ClientToServerEvents,
  payload: unknown = {},
): Promise<Ack<T>> {
  return new Promise((resolve) => {
    (c.emit as unknown as LooseEmit)(event, payload, (res) => resolve(res as Ack<T>));
  });
}

export async function waitFor<T>(
  fn: () => T | undefined | null | false,
  timeout = 3000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const lastState = (c: Client) => c.states[c.states.length - 1] as RoomState;
export const lastUpdate = (c: Client) => c.updates[c.updates.length - 1] as GameUpdate;
