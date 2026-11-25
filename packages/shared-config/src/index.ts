/**
 * Tiny constants module shared by server and web.
 * The product name is defined exactly once here so it can be renamed.
 */
export const APP_NAME = 'Lineup';

/** Room codes: 6 characters from an alphabet without look-alike characters (no I, L, O, 0, 1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const DEFAULT_GAME_CONFIG = { playerCount: 4, teamCount: 2, turnSeconds: 60 } as const;

/** Turn timer choices offered in the lobby UI (0 = off). */
export const TURN_SECONDS_OPTIONS = [0, 30, 60, 90, 120] as const;
/** Server-accepted range for turnSeconds (0 = off). Values below MIN are only allowed in TEST_MODE. */
export const MIN_TURN_SECONDS = 10;
export const MAX_TURN_SECONDS = 600;

export const NAME_MIN_LENGTH = 1;
export const NAME_MAX_LENGTH = 20;
/** Unicode letters, numbers, spaces and - _ . ' */
export const NAME_PATTERN = /^[\p{L}\p{N} \-_.']+$/u;

export const CHAT_MAX_LENGTH = 300;
export const CHAT_HISTORY_LIMIT = 100;
export const CHAT_MIN_INTERVAL_MS = 1000;

export const SOCKET_RATE_PER_SECOND = 10;
export const SOCKET_RATE_BURST = 20;
export const ROOM_CREATE_PER_MINUTE = 5;
export const MAX_SOCKETS_PER_ROOM = 20;

export const GC_SWEEP_INTERVAL_MS = 60_000;
export const GC_EMPTY_ROOM_MS = 10 * 60_000;
export const GC_FINISHED_ROOM_MS = 30 * 60_000;

export const DEFAULT_SERVER_PORT = 3001;
export const DEV_WEB_PORT = 5173;

/** localStorage keys used by the web client. */
export const STORAGE_KEYS = {
  token: 'lineup.token',
  name: 'lineup.name',
} as const;

export const TEAM_STYLE = [
  { name: 'Blue', shape: 'circle', glyph: '●' },
  { name: 'Green', shape: 'triangle', glyph: '▲' },
  { name: 'Red', shape: 'square', glyph: '■' },
] as const;
