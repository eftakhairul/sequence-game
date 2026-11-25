import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createGameServer } from './server.js';

let config: ReturnType<typeof loadConfig>;
try {
  config = loadConfig();
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const logger = createLogger(config.logLevel);
const server = createGameServer(config, logger);

await server.listen();
logger.info(
  { port: server.port(), host: config.host, webDist: config.webDist, testMode: config.testMode },
  'server listening',
);

let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  setTimeout(() => process.exit(0), 5000).unref();
  void server.close().then(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
