/**
 * The route table.
 */
import { Router } from 'express';

import type { ProfileController } from '../controllers/profileController.js';
import { validateBody } from '../middleware/validate.js';
import { ProfileRequestSchema } from '../schemas/request.js';

export const API_PREFIX = '/api/v1';

export function createRouter(controller: ProfileController): Router {
  const router = Router();

  router.get('/health', controller.health);
  router.post(`${API_PREFIX}/profile`, validateBody(ProfileRequestSchema), controller.getProfile);

  return router;
}
