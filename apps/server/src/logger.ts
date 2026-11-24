import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string): Logger {
  return pino({
    level,
    base: { app: 'lineup-server' },
    // Defence in depth: tokens and hands must never be logged.
    redact: {
      paths: ['token', '*.token', 'hand', 'hands', '*.hands', 'auth'],
      censor: '[redacted]',
    },
  });
}
