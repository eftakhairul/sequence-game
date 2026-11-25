import { isCard } from '@lineup/rules';
import type {
  Card,
  GameConfig,
  GameEvent,
  GameState,
  Line,
  PlayerView,
  RuleError,
} from '@lineup/rules';
import {
  CHAT_MAX_LENGTH,
  MAX_TURN_SECONDS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  NAME_PATTERN,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from '@lineup/shared-config';
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------
// Primitives

export const CardSchema = z.custom<Card>((v) => isCard(v), { message: 'Invalid card' });
export const CellSchema = z.number().int().min(0).max(99);
export const SeatSchema = z.number().int().min(0).max(5);
export const TeamIdSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const DirSchema = z.enum(['H', 'V', 'D1', 'D2']);

export const NameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH)
  .max(NAME_MAX_LENGTH)
  .regex(NAME_PATTERN, "Use letters, numbers, spaces and - _ . ' only");

const codeRe = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
export const RoomCodeSchema = z.string().trim().toUpperCase().regex(codeRe, 'Invalid room code');

const GameConfigBase = z.object({
  playerCount: z.union([z.literal(2), z.literal(4), z.literal(6)]),
  teamCount: z.union([z.literal(2), z.literal(3)]),
  turnSeconds: z.number().int().min(0).max(MAX_TURN_SECONDS),
});
export const GameConfigSchema = GameConfigBase.refine(
  (c) => c.teamCount === 2 || c.playerCount === 6,
  'Three teams require six players',
) satisfies z.ZodType<GameConfig>;
export const PartialGameConfigSchema = GameConfigBase.partial().strict();

export const LineSchema = z.object({
  team: TeamIdSchema,
  dir: DirSchema,
  cells: z.tuple([CellSchema, CellSchema, CellSchema, CellSchema, CellSchema]),
}) satisfies z.ZodType<Line>;

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), card: CardSchema, cell: CellSchema }).strict(),
  z.object({ type: z.literal('cut'), card: CardSchema, cell: CellSchema }).strict(),
  z.object({ type: z.literal('discardDead'), card: CardSchema }).strict(),
]);
export type ClientAction = z.infer<typeof ActionSchema>;

const ServerActionSchema = z.union([ActionSchema, z.object({ type: z.literal('timeout') })]);

const u32 = z.number().int().min(0).max(0xffffffff);
export const SeedSchema = z.tuple([u32, u32, u32, u32]);

export const GameStateSchema = z.object({
  config: GameConfigSchema,
  rng: z.object({ s: SeedSchema }),
  deck: z.array(CardSchema),
  discard: z.array(CardSchema),
  hands: z.array(z.array(CardSchema)),
  chips: z.array(TeamIdSchema.nullable()).length(100),
  lines: z.array(LineSchema),
  currentSeat: SeatSchema,
  turn: z.number().int().min(0),
  deadSwapUsed: z.boolean(),
  consecutiveTimeouts: z.array(z.number().int().min(0)),
  afk: z.array(z.boolean()),
  consecutiveSkips: z.number().int().min(0),
  status: z.enum(['playing', 'won', 'draw']),
  winner: TeamIdSchema.nullable(),
  log: z.array(z.object({ seat: SeatSchema, turn: z.number().int(), action: ServerActionSchema })),
}) satisfies z.ZodType<GameState>;

export const PlayerViewSchema = z.object({
  config: GameConfigSchema,
  you: SeatSchema.nullable(),
  hand: z.array(CardSchema),
  handCounts: z.array(z.number().int().min(0)),
  deckCount: z.number().int().min(0),
  discard: z.array(CardSchema),
  chips: z.array(TeamIdSchema.nullable()).length(100),
  lines: z.array(LineSchema),
  currentSeat: SeatSchema,
  turn: z.number().int().min(0),
  deadSwapUsed: z.boolean(),
  afk: z.array(z.boolean()),
  status: z.enum(['playing', 'won', 'draw']),
  winner: TeamIdSchema.nullable(),
}) satisfies z.ZodType<PlayerView>;

export const GameEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('chipPlaced'),
    seat: SeatSchema,
    team: TeamIdSchema,
    card: CardSchema,
    cell: CellSchema,
  }),
  z.object({
    type: z.literal('chipCut'),
    seat: SeatSchema,
    card: CardSchema,
    cell: CellSchema,
    removedTeam: TeamIdSchema,
  }),
  z.object({ type: z.literal('deadSwapped'), seat: SeatSchema, card: CardSchema }),
  z.object({ type: z.literal('lineMade'), line: LineSchema }),
  z.object({
    type: z.literal('turnSkipped'),
    seat: SeatSchema,
    reason: z.enum(['timeout', 'afk', 'noMoves']),
  }),
  z.object({ type: z.literal('deckReshuffled') }),
  z.object({
    type: z.literal('gameOver'),
    status: z.enum(['won', 'draw']),
    winner: TeamIdSchema.nullable(),
  }),
]) satisfies z.ZodType<GameEvent>;

// ---------------------------------------------------------------------------------------------
// Client → server payloads

const Empty = z.object({}).strict();

export const RoomCreateSchema = z.object({ name: NameSchema });
export const RoomJoinSchema = z.object({ code: RoomCodeSchema, name: NameSchema });
export const RoomLeaveSchema = Empty;
export const RoomSeatSchema = z.object({ seat: SeatSchema.nullable() });
export const RoomConfigSchema = PartialGameConfigSchema;
export const RoomKickSchema = z.object({ playerId: z.string().min(1).max(64) });
export const RoomStartSchema = Empty;
export const RoomRematchSchema = Empty;
export const GameActionSchema = ActionSchema;
/** Control characters are stripped before length validation. */
export const ChatSendSchema = z.object({
  text: z
    .string()
    .max(CHAT_MAX_LENGTH * 4)
    .transform((t) => stripControlChars(t).trim())
    .pipe(z.string().min(1).max(CHAT_MAX_LENGTH)),
});
/** TEST_MODE only */
export const RoomTestStartSchema = z.object({ seed: SeedSchema });
/** TEST_MODE only */
export const GameTestSetStateSchema = z.object({ state: GameStateSchema });

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g;
export function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS, '');
}

// ---------------------------------------------------------------------------------------------
// Server → client payloads

export const SeatInfoSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  connected: z.boolean(),
});
export type SeatInfo = z.infer<typeof SeatInfoSchema>;

export const RoomPhaseSchema = z.enum(['lobby', 'playing', 'finished']);
export type RoomPhase = z.infer<typeof RoomPhaseSchema>;

export const RoomStateSchema = z.object({
  code: z.string(),
  hostId: z.string(),
  config: GameConfigSchema,
  seats: z.array(SeatInfoSchema.nullable()),
  phase: RoomPhaseSchema,
  you: z.string(),
  turnDeadline: z.number().nullable(),
  /** Players in the room who are not seated (lobby) or arrived after the game started. */
  waiting: z.array(SeatInfoSchema),
  /** Server clock (epoch ms) at send time, so clients can correct their countdown for skew. */
  serverNow: z.number(),
});
export type RoomState = z.infer<typeof RoomStateSchema>;

export const GameUpdateSchema = z.object({
  view: PlayerViewSchema,
  events: z.array(GameEventSchema),
  turnDeadline: z.number().nullable(),
  serverNow: z.number(),
});
export type GameUpdate = z.infer<typeof GameUpdateSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  playerId: z.string(),
  name: z.string(),
  text: z.string(),
  at: z.number(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const SessionInitSchema = z.object({ playerId: z.string(), token: z.string() });
export type SessionInit = z.infer<typeof SessionInitSchema>;

export type ServerErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NOT_HOST'
  | 'NOT_IN_ROOM'
  | 'WRONG_PHASE'
  | 'SEATS_NOT_FILLED'
  | 'SEAT_TAKEN'
  | 'KICKED'
  | 'INTERNAL';
export type ErrorCode = ServerErrorCode | RuleError;

export const ErrorPayloadSchema = z.object({ code: z.string(), message: z.string().optional() });
export type ErrorPayload = { code: ErrorCode; message?: string };

export type AckOk<T extends object = object> = { ok: true } & T;
export type AckErr = { ok: false; code: ErrorCode; message?: string };
export type Ack<T extends object = object> = AckOk<T> | AckErr;
export type AckFn<T extends object = object> = (res: Ack<T>) => void;

// ---------------------------------------------------------------------------------------------
// Typed Socket.IO event maps

export interface ClientToServerEvents {
  'room:create': (p: z.input<typeof RoomCreateSchema>, ack: AckFn<{ code: string }>) => void;
  'room:join': (p: z.input<typeof RoomJoinSchema>, ack: AckFn) => void;
  'room:leave': (p: Record<string, never>, ack: AckFn) => void;
  'room:seat': (p: z.input<typeof RoomSeatSchema>, ack: AckFn) => void;
  'room:config': (p: z.input<typeof RoomConfigSchema>, ack: AckFn) => void;
  'room:kick': (p: z.input<typeof RoomKickSchema>, ack: AckFn) => void;
  'room:start': (p: Record<string, never>, ack: AckFn) => void;
  'room:rematch': (p: Record<string, never>, ack: AckFn) => void;
  'game:action': (p: ClientAction, ack: AckFn) => void;
  'chat:send': (p: z.input<typeof ChatSendSchema>, ack: AckFn) => void;
  'room:testStart': (p: z.input<typeof RoomTestStartSchema>, ack: AckFn) => void;
  'game:testSetState': (p: { state: GameState }, ack: AckFn) => void;
}

export interface ServerToClientEvents {
  'session:init': (p: SessionInit) => void;
  'room:state': (p: RoomState) => void;
  'game:update': (p: GameUpdate) => void;
  'chat:message': (p: ChatMessage) => void;
  'chat:history': (p: ChatMessage[]) => void;
  error: (p: ErrorPayload) => void;
  'server:shutdown': (p: Record<string, never>) => void;
}

/** Schema for every client → server event (used by the server to validate payloads). */
export const clientEventSchemas = {
  'room:create': RoomCreateSchema,
  'room:join': RoomJoinSchema,
  'room:leave': RoomLeaveSchema,
  'room:seat': RoomSeatSchema,
  'room:config': RoomConfigSchema,
  'room:kick': RoomKickSchema,
  'room:start': RoomStartSchema,
  'room:rematch': RoomRematchSchema,
  'game:action': GameActionSchema,
  'chat:send': ChatSendSchema,
  'room:testStart': RoomTestStartSchema,
  'game:testSetState': GameTestSetStateSchema,
} as const satisfies Record<keyof ClientToServerEvents, z.ZodType>;

export type ClientEventName = keyof ClientToServerEvents;
