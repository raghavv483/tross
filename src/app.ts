/**
 * Application assembly.
 *
 * Everything is wired here and nothing is a module-level singleton, so a test
 * can build a fresh app with its own source, cache and rate limit without
 * touching global state.
 */
import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import { pinoHttp } from 'pino-http';

import { getEnv, type Env } from './config/env.js';
import { createLogger, type Logger } from './config/logger.js';
import { ProfileController } from './controllers/profileController.js';
import { AppError } from './errors/AppError.js';
import { createDocsRouter } from './docs/router.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { API_PREFIX, createRouter } from './routes/index.js';
import { ProfileService } from './services/ProfileService.js';
import { createProfileSource } from './sources/index.js';
import type { ProfileSource } from './sources/ProfileSource.js';
import type { Profile } from './types/profile.js';
import { createProfileCache } from './utils/cache.js';

export interface CreateAppOptions {
  readonly env?: Env;
  readonly logger?: Logger;
  /** Overrides the configured source. Tests inject stubs through this. */
  readonly source?: ProfileSource;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const env = options.env ?? getEnv();
  const logger = options.logger ?? createLogger(env);
  const source = options.source ?? createProfileSource(env.PROFILE_SOURCE);

  const cache = createProfileCache<Profile>(env.CACHE_TTL_SECONDS);
  const service = new ProfileService(source, cache);
  const controller = new ProfileController(service);

  const app = express();

  // Railway terminates TLS and forwards through one proxy hop. Without this
  // every request appears to come from the proxy, and the rate limiter would
  // key the whole internet onto a single bucket. `1` rather than `true`: a
  // permissive setting would let a client forge X-Forwarded-For and evade it.
  app.set('trust proxy', 1);

  // Nothing is gained by advertising the framework.
  app.disable('x-powered-by');

  app.use(pinoHttp({ logger }));

  // N4: the only valid request is one short URL.
  app.use(express.json({ limit: '10kb' }));

  /**
   * Documentation is mounted BEFORE the rate limiter, and that ordering is
   * load-bearing. The limiter below is attached to the `/api/v1` prefix, and
   * both `/api/v1/docs` and `/api/v1/openapi.json` sit inside that prefix - so
   * registering them afterwards would spend a client's request budget on
   * reading the reference. Express runs middleware in registration order, so
   * being first is what exempts them.
   */
  app.use(createDocsRouter());

  // Mounted on the API prefix only, which is what makes /health exempt.
  app.use(
    API_PREFIX,
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      // Routed through the error handler so a 429 body matches every other
      // error body, rather than being whatever the library would have sent.
      handler: (_req, _res, next) => {
        next(new AppError('RATE_LIMITED'));
      },
    }),
  );

  app.use(createRouter(controller));

  // Order matters: unmatched routes first, then the single error exit.
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
