/**
 * Process entry point: configuration, binding and shutdown.
 *
 * Boot fails fast and loudly on invalid configuration (N5). The failure
 * message names the failing keys only, never their values.
 *
 * This module binds a port as a side effect of being imported, so nothing
 * imports it - `createApp` in `src/app.ts` is the seam tests use.
 */
import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { registerShutdownHandlers } from './utils/shutdown.js';

function main(): void {
  const env = getEnv();
  const logger = createLogger(env);

  const app = createApp({ env, logger });

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      {
        host: env.HOST,
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        profileSource: env.PROFILE_SOURCE,
        cacheTtlSeconds: env.CACHE_TTL_SECONDS,
      },
      // Note: with LOG_LEVEL=silent this prints nothing. The server is bound
      // and serving regardless - a silent server only looks dead.
      'server listening',
    );
  });

  registerShutdownHandlers(server, logger);
}

try {
  main();
} catch (error) {
  // Configuration errors carry keys only, so this is safe to print. Anything
  // else is a genuine boot failure and the process must not stay up. There is
  // no logger at this point, which is why this is the one bare console write.
  console.error(error instanceof Error ? error.message : 'Failed to start server.');
  process.exit(1);
}
