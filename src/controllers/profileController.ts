/**
 * HTTP in and out only. No business logic lives here.
 *
 * The controller's whole job is to take a validated body, hand it to the
 * service, and shape the result into the response envelope. Every decision
 * about what the data means was made before it got here.
 */
import type { Request, RequestHandler, Response } from 'express';

import type { ProfileService } from '../services/ProfileService.js';
import {
  HealthResponseSchema,
  ProfileResponseSchema,
} from '../schemas/response.js';
import type { ProfileRequest } from '../schemas/request.js';

export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  /**
   * `POST /api/v1/profile`.
   *
   * Express 5 propagates a rejected promise to the error handler on its own,
   * so there is no try/catch here and no `express-async-errors` wrapper. A
   * thrown `AppError` leaves through `errorHandler` like every other failure.
   */
  getProfile: RequestHandler = async (req: Request, res: Response): Promise<void> => {
    // `req.body` was replaced by `validateBody` with the stripped, parsed
    // result, so this cannot be reading an undeclared field.
    const { url } = req.body as ProfileRequest;

    const result = await this.service.getProfile(url);

    // Parsed, not constructed. Zod strips undeclared keys, so an unexpected
    // field cannot leak into a response even if it survived the parser. This
    // is the leak guard, not a formality.
    const body = ProfileResponseSchema.parse({
      success: true,
      data: result.profile,
      meta: {
        source: result.source,
        profileUrl: result.profileUrl,
        cached: result.cached,
        retrievedAt: new Date().toISOString(),
      },
    });

    res.status(200).json(body);
  };

  /**
   * `GET /health`.
   *
   * `authorizationScope` is surfaced so the deployment's data-access basis is
   * inspectable without reading the source.
   */
  health: RequestHandler = (_req: Request, res: Response): void => {
    const body = HealthResponseSchema.parse({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      source: this.service.sourceName,
      authorizationScope: this.service.authorizationScope,
    });

    res.status(200).json(body);
  };
}
