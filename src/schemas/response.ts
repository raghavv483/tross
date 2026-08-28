/**
 * Response envelopes - the leak boundary. Invariant 3.
 *
 * Every success response is built by `.parse()`-ing one of these schemas
 * before `res.json()`. Zod strips undeclared keys, so an unexpected upstream
 * field cannot reach a client even if it survived the parser. This is the
 * structural guard that replaces what Fastify's response serialization would
 * have given us, at the cost of one `.parse()` per handler.
 *
 * Do not bypass it by constructing a response literal and sending it directly.
 */
import { z } from 'zod';

import { ERROR_CODES } from '../errors/AppError.js';
import { ProfileSchema } from '../types/profile.js';

export const ProfileMetaSchema = z.object({
  /** `name` of the active `ProfileSource`. */
  source: z.string(),
  /** Canonicalised form of the input - the cache key. */
  profileUrl: z.string(),
  /** Whether this was served from the TTL cache. */
  cached: z.boolean(),
  /** ISO 8601 timestamp of this response. */
  retrievedAt: z.string(),
});

export const ProfileResponseSchema = z.object({
  success: z.literal(true),
  data: ProfileSchema,
  meta: ProfileMetaSchema,
});

/**
 * The ONLY error shape. SPEC §1.
 *
 * `error` carries exactly `code` and `message`. There is deliberately no field
 * here for a stack trace, a cause, an upstream payload or a detail array -
 * absence from this schema is what makes it structurally impossible to send
 * one, rather than a rule someone has to remember.
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
  source: z.string(),
  /** Surfaced so the deployment's data-access basis is inspectable. */
  authorizationScope: z.string(),
});

export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
