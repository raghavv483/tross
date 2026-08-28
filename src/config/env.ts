/**
 * Environment validation. SPEC.md §6.
 *
 * Secrets are read here and nowhere else. Configuration is validated once, at
 * boot, and invalid configuration throws before the server binds.
 *
 * The failure message names the failing KEYS ONLY. It never includes a value,
 * because one of them may be a secret and boot errors are the single most
 * likely thing to end up pasted into a chat, a CI log or an issue tracker.
 * Zod's own issue messages echo the received value, so they are deliberately
 * not used here.
 */
import { z } from 'zod';

import { PROFILE_SOURCE_NAMES } from '../sources/index.js';

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export const NODE_ENVS = ['development', 'test', 'production'] as const;

export const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('0.0.0.0'),
    NODE_ENV: z.enum(NODE_ENVS).default('development'),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

    PROFILE_SOURCE: z.enum(PROFILE_SOURCE_NAMES).default('fixture'),

    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),

    /** `0` disables caching entirely. */
    CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(900),

    LINKEDIN_CLIENT_ID: z.string().min(1).optional(),
    LINKEDIN_CLIENT_SECRET: z.string().min(1).optional(),
    LINKEDIN_REDIRECT_URI: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.PROFILE_SOURCE !== 'linkedin-oidc') return;

    // These three are required only when the OIDC source is selected. Flagging
    // them by key keeps the message safe to print.
    for (const key of ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI'] as const) {
      if (value[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'required when PROFILE_SOURCE=linkedin-oidc',
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Raised at boot. Never reaches a response — the server has not bound yet. */
export class ConfigError extends Error {
  readonly keys: readonly string[];

  constructor(keys: readonly string[]) {
    super(
      `Invalid environment configuration. Check these variables: ${keys.join(', ')}. ` +
        'Values are omitted from this message because one of them may be a secret.',
    );
    this.name = 'ConfigError';
    this.keys = keys;
  }
}

/**
 * An unset variable and one set to an empty string mean the same thing.
 * `.env` files routinely carry `LINKEDIN_CLIENT_SECRET=` placeholders, and
 * treating that as a present-but-invalid value would be actively unhelpful.
 */
function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string> {
  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue;
    if (value.trim().length === 0) continue;
    entries.push([key, value]);
  }

  return Object.fromEntries(entries);
}

/**
 * Validates an environment. Throws `ConfigError` naming only the failing keys.
 *
 * The issue `code` is included alongside each key: it is a fixed enum such as
 * `invalid_type` or `too_small` and carries no user data.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(withoutBlanks(source));

  if (result.success) return result.data;

  const keys = [
    ...new Set(
      result.error.issues.map((issue) => {
        const key = issue.path.join('.');
        return key.length === 0 ? `(root): ${issue.code}` : `${key} (${issue.code})`;
      }),
    ),
  ].sort();

  throw new ConfigError(keys);
}

let cached: Env | undefined;

/** Memoized accessor. Boot calls this once; nothing else should need to. */
export function getEnv(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test seam. Not used by application code. */
export function resetEnvCache(): void {
  cached = undefined;
}
