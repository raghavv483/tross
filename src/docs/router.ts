/**
 * Documentation routes: Swagger UI and the raw OpenAPI document.
 *
 * Mounted BEFORE the rate limiter in `src/app.ts`. The limiter is attached to
 * the `/api/v1` prefix, so these paths sit inside its scope and would
 * otherwise consume a client's request budget just for reading the docs.
 * Middleware order is what exempts them - see the comment at the mount site.
 */
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { buildOpenApiDocument } from './openapi.js';
import type { JsonSchema } from './schemas.js';

export const DOCS_PATH = '/api/v1/docs';
export const OPENAPI_PATH = '/api/v1/openapi.json';

export function createDocsRouter(document: JsonSchema = buildOpenApiDocument()): Router {
  const router = Router();

  // The raw document, for client generators and for anyone who would rather
  // read JSON than a rendered page.
  router.get(OPENAPI_PATH, (_req, res) => {
    res.status(200).json(document);
  });

  router.use(
    DOCS_PATH,
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'LinkedIn Profile API - reference',
      swaggerOptions: {
        // Collapsed operations hide the point of the page; expanded models are
        // the reason the schemas were hoisted into named components at all.
        docExpansion: 'list',
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 3,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      },
    }),
  );

  return router;
}
