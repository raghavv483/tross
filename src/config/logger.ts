/**
 * Structured logging. Invariant 6.
 *
 * The `redact` list below is a SECURITY CONTROL, not formatting. It is what
 * turns "never log a cookie" from a discipline someone has to remember into
 * configuration that holds even when a future handler logs a whole request
 * object by accident.
 *
 * When you add a field that could carry a token, cookie or secret, add its
 * path here in the same commit.
 */
import { pino, type Logger, type LoggerOptions } from 'pino';

import type { Env } from './env.js';

/**
 * Paths pino replaces with `[Redacted]`.
 *
 * Both `camelCase` and `snake_case` spellings are listed because OAuth
 * payloads use the latter while our own code uses the former, and a redact
 * list that only covers the spelling we happen to write today is a list that
 * fails the first time an upstream body is logged.
 *
 * The `*.` wildcard matches one level, so bare and one-level-nested forms are
 * both enumerated.
 */
export const REDACT_PATHS: readonly string[] = [
  // --- request / response headers ---
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["proxy-authorization"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',

  // --- an error carrying a request config, e.g. from an HTTP client ---
  'err.config',
  'err.request',
  'error.config',
  'error.request',
  'cause.config',

  // --- OAuth / OIDC tokens ---
  'accessToken',
  '*.accessToken',
  'access_token',
  '*.access_token',
  'refreshToken',
  '*.refreshToken',
  'refresh_token',
  '*.refresh_token',
  'idToken',
  '*.idToken',
  'id_token',
  '*.id_token',

  // --- client credentials ---
  'clientSecret',
  '*.clientSecret',
  'client_secret',
  '*.client_secret',
  'LINKEDIN_CLIENT_SECRET',
  '*.LINKEDIN_CLIENT_SECRET',
  // pino matches exact key names, so the generic `token` path below does NOT
  // cover this one. Added with the env var itself, per invariant 6.
  'APIFY_API_TOKEN',
  '*.APIFY_API_TOKEN',

  // --- generic secret-bearing names ---
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'password',
  '*.password',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'api_key',
  '*.api_key',
  'secret',
  '*.secret',
  'credentials',
  '*.credentials',
];

export const REDACTED_PLACEHOLDER = '[Redacted]';

export function createLoggerOptions(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): LoggerOptions {
  const options: LoggerOptions = {
    level: env.LOG_LEVEL,
    redact: {
      paths: [...REDACT_PATHS],
      censor: REDACTED_PLACEHOLDER,
    },
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Pretty output is a development convenience only. `silent` needs no
  // transport at all - starting one would be pure overhead for zero output.
  if (env.NODE_ENV === 'development' && env.LOG_LEVEL !== 'silent') {
    return {
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    };
  }

  return options;
}

export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): Logger {
  return pino(createLoggerOptions(env));
}

export type { Logger };
