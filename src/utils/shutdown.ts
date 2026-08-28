/**
 * Graceful shutdown.
 *
 * Lives here rather than in `server.ts` so it can be imported and tested
 * without executing the entry point and binding a port.
 *
 * Railway sends SIGTERM on every redeploy. Without draining, the process dies
 * mid-request and a client sees a connection reset instead of its response.
 */
import type { Logger } from '../config/logger.js';

/** Time a draining server is given before the process exits anyway. */
export const SHUTDOWN_GRACE_MS = 10_000;

/** The part of `http.Server` that shutdown actually needs. */
export interface ClosableServer {
  close(callback: (error?: Error) => void): unknown;
}

export interface ShutdownOptions {
  readonly gracePeriodMs?: number;
  /** Injected so a test can observe the exit code without exiting. */
  readonly exit?: (code: number) => void;
}

/**
 * Registers SIGTERM/SIGINT handlers that drain in-flight requests before
 * exiting. Returns a function that unregisters them.
 */
export function registerShutdownHandlers(
  server: ClosableServer,
  logger: Logger,
  options: ShutdownOptions = {},
): () => void {
  const gracePeriodMs = options.gracePeriodMs ?? SHUTDOWN_GRACE_MS;
  const exit = options.exit ?? ((code: number): void => process.exit(code));

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    // A second Ctrl-C must not start a second drain.
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'shutting down');

    const forceExit = setTimeout(() => {
      logger.error({ signal, gracePeriodMs }, 'shutdown timed out, exiting');
      exit(1);
    }, gracePeriodMs);

    // Do not hold the process open just to wait for this timeout.
    forceExit.unref();

    server.close((error?: Error) => {
      clearTimeout(forceExit);

      if (error) {
        logger.error({ err: error }, 'error while closing server');
        exit(1);
        return;
      }

      logger.info('shutdown complete');
      exit(0);
    });
  };

  const onSigterm = (): void => {
    shutdown('SIGTERM');
  };
  const onSigint = (): void => {
    shutdown('SIGINT');
  };

  process.on('SIGTERM', onSigterm);
  process.on('SIGINT', onSigint);

  return () => {
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  };
}
