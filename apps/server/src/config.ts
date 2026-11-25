import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SERVER_PORT, ROOM_CREATE_PER_MINUTE } from '@lineup/shared-config';

export interface ServerConfig {
  port: number;
  host: string;
  webDist: string;
  corsOrigin: string | undefined;
  logLevel: string;
  testMode: boolean;
  trustProxy: boolean;
  /** ms a disconnected host keeps the host role before it passes on. */
  hostGraceMs: number;
  /** Rooms one IP may create per minute. */
  roomCreatePerMinute: number;
}

/** apps/server — relative WEB_DIST paths are resolved from here, independent of the cwd. */
const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const testMode = env.TEST_MODE === '1';
  if (testMode && env.NODE_ENV === 'production') {
    throw new Error('Refusing to start: TEST_MODE=1 is not allowed when NODE_ENV=production');
  }
  const webDist = env.WEB_DIST ?? '../web/dist';
  return {
    port: env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : DEFAULT_SERVER_PORT,
    host: env.HOST ?? '0.0.0.0',
    webDist: isAbsolute(webDist) ? webDist : resolve(SERVER_ROOT, webDist),
    corsOrigin: env.CORS_ORIGIN || undefined,
    logLevel: env.LOG_LEVEL ?? 'info',
    testMode,
    trustProxy: env.TRUST_PROXY === '1',
    hostGraceMs: env.HOST_GRACE_MS !== undefined ? Number(env.HOST_GRACE_MS) : 30_000,
    roomCreatePerMinute:
      env.ROOM_CREATE_LIMIT !== undefined ? Number(env.ROOM_CREATE_LIMIT) : ROOM_CREATE_PER_MINUTE,
  };
}
