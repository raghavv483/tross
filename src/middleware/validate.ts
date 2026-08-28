/**
 * Body validation.
 *
 * Zod parses the body and REPLACES `req.body` with the stripped result. That
 * replacement is the point: a handler downstream cannot read an
 * attacker-supplied extra field, because after this middleware runs the field
 * is no longer there to read.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';

import { AppError } from '../errors/AppError.js';

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      // The Zod issues quote the received value, so they go in `cause` for
      // logging and never into the response.
      next(
        new AppError('INVALID_PROFILE_URL', {
          publicMessage:
            'Request body is invalid. Expected {"url": "https://www.linkedin.com/in/<profile-slug>"}.',
          cause: result.error,
        }),
      );
      return;
    }

    req.body = result.data;
    next();
  };
}
