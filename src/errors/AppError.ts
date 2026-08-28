/**
 * The single error taxonomy for the service.
 *
 * Invariant: errors only ever leave through `AppError`. Sources, services and
 * parsers throw `AppError` — never a bare `Error`, never an upstream error
 * object. An upstream cause rides along in `cause` for logging only; it is
 * never serialized into a response.
 *
 * `src/middleware/errorHandler.ts` is the only place that writes an error body,
 * and it serializes nothing except `code` and `publicMessage`.
 */

/** Machine-readable error codes. SPEC.md §4. */
export const ERROR_CODES = [
  'INVALID_PROFILE_URL',
  'PROFILE_NOT_FOUND',
  'SOURCE_UNAUTHORIZED',
  'SOURCE_NOT_AUTHORIZED_FOR_URL',
  'SOURCE_RATE_LIMITED',
  'RATE_LIMITED',
  'SOURCE_UNAVAILABLE',
  'UPSTREAM_ERROR',
  'MALFORMED_SOURCE_RESPONSE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP status for each code. SPEC.md §4. */
const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  INVALID_PROFILE_URL: 400,
  PROFILE_NOT_FOUND: 404,
  SOURCE_UNAUTHORIZED: 403,
  SOURCE_NOT_AUTHORIZED_FOR_URL: 403,
  SOURCE_RATE_LIMITED: 429,
  RATE_LIMITED: 429,
  SOURCE_UNAVAILABLE: 503,
  UPSTREAM_ERROR: 502,
  MALFORMED_SOURCE_RESPONSE: 502,
  INTERNAL_ERROR: 500,
};

/**
 * Default client-safe message for each code.
 *
 * These are deliberately generic: they describe the class of failure without
 * revealing anything about upstream infrastructure.
 */
const DEFAULT_MESSAGE_BY_CODE: Readonly<Record<ErrorCode, string>> = {
  INVALID_PROFILE_URL:
    'The supplied URL is not a valid LinkedIn profile URL.',
  PROFILE_NOT_FOUND: 'No profile was found for the supplied URL.',
  SOURCE_UNAUTHORIZED:
    'The configured profile source is not authorized to retrieve profile data.',
  SOURCE_NOT_AUTHORIZED_FOR_URL:
    'The configured profile source is not authorized to retrieve this particular profile.',
  SOURCE_RATE_LIMITED:
    'The upstream profile source is currently rate limiting requests. Please retry later.',
  RATE_LIMITED: 'Too many requests. Please retry later.',
  SOURCE_UNAVAILABLE: 'The profile source is currently unavailable.',
  UPSTREAM_ERROR: 'The profile source returned an error.',
  MALFORMED_SOURCE_RESPONSE:
    'The profile source returned data that could not be normalized into a valid profile.',
  INTERNAL_ERROR: 'An unexpected internal error occurred.',
};

export interface AppErrorOptions {
  /** Overrides the default client-safe message for the code. */
  readonly publicMessage?: string;
  /** Underlying cause. Logged, never serialized to a client. */
  readonly cause?: unknown;
  /**
   * Structured, non-sensitive detail for logs only. Never serialized to a
   * client. Do not put upstream payloads or secrets here.
   */
  readonly context?: Readonly<Record<string, unknown>>;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  /** The only message text that may reach a client. */
  readonly publicMessage: string;
  readonly context: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const publicMessage = options.publicMessage ?? DEFAULT_MESSAGE_BY_CODE[code];

    // `message` is for logs. `publicMessage` is what a client may see. They are
    // the same by default, but only `publicMessage` is ever serialized.
    super(publicMessage, options.cause === undefined ? undefined : { cause: options.cause });

    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
    this.publicMessage = publicMessage;
    this.context = options.context;

    Error.captureStackTrace?.(this, AppError);
  }

  static isAppError(value: unknown): value is AppError {
    return value instanceof AppError;
  }

  /**
   * Normalizes an unknown throwable into an `AppError`.
   *
   * Anything unrecognised becomes a generic `INTERNAL_ERROR` with a fixed
   * message, so an upstream error's own message cannot become a response body.
   */
  static from(value: unknown): AppError {
    if (AppError.isAppError(value)) return value;
    return new AppError('INTERNAL_ERROR', { cause: value });
  }

  /** The complete client-visible error body. SPEC.md §1. */
  toPublicJSON(): { readonly code: ErrorCode; readonly message: string } {
    return { code: this.code, message: this.publicMessage };
  }
}

/** Convenience constructors — keep call sites at the throw site readable. */
export const invalidProfileUrl = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('INVALID_PROFILE_URL', { publicMessage, cause });

export const profileNotFound = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('PROFILE_NOT_FOUND', { publicMessage, cause });

export const sourceUnauthorized = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('SOURCE_UNAUTHORIZED', { publicMessage, cause });

export const sourceNotAuthorizedForUrl = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('SOURCE_NOT_AUTHORIZED_FOR_URL', { publicMessage, cause });

export const sourceRateLimited = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('SOURCE_RATE_LIMITED', { publicMessage, cause });

export const rateLimited = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('RATE_LIMITED', { publicMessage, cause });

export const sourceUnavailable = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('SOURCE_UNAVAILABLE', { publicMessage, cause });

export const upstreamError = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('UPSTREAM_ERROR', { publicMessage, cause });

export const malformedSourceResponse = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('MALFORMED_SOURCE_RESPONSE', { publicMessage, cause });

export const internalError = (publicMessage?: string, cause?: unknown): AppError =>
  new AppError('INTERNAL_ERROR', { publicMessage, cause });
