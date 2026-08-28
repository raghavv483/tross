/**
 * The single exit for every failure. Invariant 2.
 *
 * This is the ONLY place in the codebase that writes an error body. It
 * serializes nothing except `code` and `publicMessage`: an unrecognised
 * throwable becomes a generic 500 with a fixed message, so a stack trace, an
 * upstream payload or a library's own error text cannot reach a client.
 */
import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/AppError.js';
import type { Logger } from '../config/logger.js';
import { ErrorResponseSchema } from '../schemas/response.js';

/**
 * body-parser failures arrive as generic errors carrying a `type` field.
 * They are client mistakes, not server faults, so they must not become 500s.
 */
interface BodyParserError extends Error {
  readonly type?: string;
  readonly status?: number;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  if (!(error instanceof Error)) return false;
  const type = (error as BodyParserError).type;
  return typeof type === 'string' && type.startsWith('entity.');
}

/**
 * Maps a throwable onto the taxonomy.
 *
 * Anything not recognised becomes `INTERNAL_ERROR`, whose public message is a
 * fixed string that describes nothing about what actually went wrong.
 */
function toAppError(error: unknown): AppError {
  if (AppError.isAppError(error)) return error;

  if (isBodyParserError(error)) {
    // entity.too.large  -> the 10 kb cap was exceeded
    // entity.parse.failed -> the body was not valid JSON
    // INVALID_REQUEST_BODY, not INVALID_PROFILE_URL: the request never parsed,
    // so there is no URL to have been wrong. Telling someone who sent a 12 kb
    // body to check their LinkedIn URL sends them to the wrong place entirely.
    return new AppError('INVALID_REQUEST_BODY', {
      publicMessage:
        error.type === 'entity.too.large'
          ? 'Request body is too large. The maximum accepted size is 10 kb.'
          : 'Request body could not be parsed as JSON.',
      cause: error,
    });
  }

  return AppError.from(error);
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express identifies an error handler by its arity - all four parameters
  // must be declared even though `next` is only used for the headers-sent case.
  return (error: unknown, req: Request, res: Response, next: NextFunction): void => {
    const appError = toAppError(error);

    const logPayload = {
      err: appError,
      code: appError.code,
      statusCode: appError.statusCode,
      method: req.method,
      path: req.path,
      ...(appError.context === undefined ? {} : { context: appError.context }),
    };

    // A server fault is an error; a client mistake is a warning. Logging every
    // 400 at error level is how a genuine 500 gets lost in the noise.
    if (appError.statusCode >= 500) {
      logger.error(logPayload, 'request failed');
    } else {
      logger.warn(logPayload, 'request rejected');
    }

    // Nothing can be done once the response has started; hand back to Express
    // so it can destroy the connection.
    if (res.headersSent) {
      next(error);
      return;
    }

    // Parsed, not constructed: the schema is what guarantees no fifth key ever
    // appears in an error body.
    const body = ErrorResponseSchema.parse({
      success: false,
      error: appError.toPublicJSON(),
    });

    res.status(appError.statusCode).json(body);
  };
}

/**
 * Unmatched routes. SPEC §4 maps these onto `PROFILE_NOT_FOUND` rather than
 * inventing a separate code, so a client only ever has to understand one 404.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(
    new AppError('PROFILE_NOT_FOUND', {
      publicMessage: 'The requested resource does not exist.',
      context: { method: req.method, path: req.path },
    }),
  );
}
