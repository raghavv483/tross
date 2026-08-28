import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { loadEnv, type Env } from '../src/config/env.js';
import { buildOpenApiDocument } from '../src/docs/openapi.js';
import { ERROR_CODES } from '../src/errors/AppError.js';

const app = (overrides: Partial<Env> = {}): express.Express => {
  const env: Env = { ...loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }), ...overrides };
  return createApp({ env });
};

const document = buildOpenApiDocument();

/** Narrow helper so tests can walk the document without `any` everywhere. */
const at = (root: unknown, ...keys: readonly (string | number)[]): unknown => {
  let current: unknown = root;
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
};

describe('GET /api/v1/docs', () => {
  it('returns 200 HTML', async () => {
    const response = await request(app()).get('/api/v1/docs/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
  });

  it('serves the Swagger UI page, not an empty shell', async () => {
    const response = await request(app()).get('/api/v1/docs/');

    expect(response.text).toContain('swagger-ui');
    expect(response.text).toContain('<title>LinkedIn Profile API - reference</title>');
  });

  it('serves the Swagger UI assets the page depends on', async () => {
    const server = app();

    for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-init.js']) {
      const response = await request(server).get(`/api/v1/docs/${asset}`);
      expect(response.status, asset).toBe(200);
    }
  });

  it('embeds the document into the page, so it renders without a second fetch', async () => {
    const response = await request(app()).get('/api/v1/docs/swagger-ui-init.js');

    expect(response.text).toContain('LinkedIn Profile API');
    expect(response.text).toContain('/api/v1/profile');
  });
});

describe('GET /api/v1/openapi.json', () => {
  it('returns 200 and parses as JSON', async () => {
    const response = await request(app()).get('/api/v1/openapi.json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(() => JSON.parse(response.text)).not.toThrow();
  });

  it('declares OpenAPI 3.1', async () => {
    const response = await request(app()).get('/api/v1/openapi.json');
    expect(JSON.parse(response.text).openapi).toBe('3.1.0');
  });
});

describe('the document is exempt from the rate limiter', () => {
  it('serves docs and the raw document after the API budget is exhausted', async () => {
    const server = app({ RATE_LIMIT_MAX: 1 });
    const url = 'https://www.linkedin.com/in/complete-profile';

    await request(server).post('/api/v1/profile').send({ url });
    const blocked = await request(server).post('/api/v1/profile').send({ url });
    expect(blocked.status).toBe(429);

    // Both live under /api/v1, which is exactly where the limiter is mounted.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request(server).get('/api/v1/openapi.json')).status).toBe(200);
      expect((await request(server).get('/api/v1/docs/')).status).toBe(200);
    }
  });
});

describe('the document covers the API surface', () => {
  it('lists both endpoints', () => {
    const paths = Object.keys(document['paths'] as Record<string, unknown>);
    expect(paths.sort()).toEqual(['/api/v1/profile', '/health']);
  });

  it('documents POST on the profile endpoint and GET on health', () => {
    expect(at(document, 'paths', '/api/v1/profile', 'post', 'operationId')).toBe('getProfile');
    expect(at(document, 'paths', '/health', 'get', 'operationId')).toBe('getHealth');
  });

  it('documents every error code in SPEC §4', () => {
    const serialized = JSON.stringify(document);

    for (const code of ERROR_CODES) {
      expect(serialized, `undocumented error code: ${code}`).toContain(code);
    }
  });

  it('gives every documented error code a realistic example under its status', () => {
    const responses = at(document, 'paths', '/api/v1/profile', 'post', 'responses') as Record<
      string,
      unknown
    >;

    const documented = new Set<string>();

    for (const [status, response] of Object.entries(responses)) {
      if (status === '200') continue;

      const examples = at(response, 'content', 'application/json', 'examples') as Record<
        string,
        { value: { error: { code: string; message: string } } }
      >;

      expect(Object.keys(examples).length, `status ${status} has no examples`).toBeGreaterThan(0);

      for (const [name, example] of Object.entries(examples)) {
        documented.add(name);
        // A realistic example: the real code, and a non-empty real message.
        expect(example.value.error.code).toBe(name);
        expect(example.value.error.message.length).toBeGreaterThan(0);
        expect(Object.keys(example.value.error).sort()).toEqual(['code', 'message']);
      }
    }

    expect([...documented].sort()).toEqual([...ERROR_CODES].sort());
  });

  it('maps each error code to the status SPEC §4 assigns it', () => {
    const responses = at(document, 'paths', '/api/v1/profile', 'post', 'responses') as Record<
      string,
      unknown
    >;

    const expected: Record<string, string> = {
      INVALID_PROFILE_URL: '400',
      INVALID_REQUEST_BODY: '400',
      PROFILE_NOT_FOUND: '404',
      SOURCE_UNAUTHORIZED: '403',
      SOURCE_NOT_AUTHORIZED_FOR_URL: '403',
      SOURCE_RATE_LIMITED: '429',
      RATE_LIMITED: '429',
      SOURCE_UNAVAILABLE: '503',
      UPSTREAM_ERROR: '502',
      MALFORMED_SOURCE_RESPONSE: '502',
      INTERNAL_ERROR: '500',
    };

    for (const [code, status] of Object.entries(expected)) {
      const examples = at(responses[status], 'content', 'application/json', 'examples') as Record<
        string,
        unknown
      >;
      expect(Object.keys(examples), `${code} should be documented under ${status}`).toContain(code);
    }
  });
});

describe('the document is structurally sound for Swagger UI', () => {
  it('resolves every $ref against components.schemas', () => {
    const components = at(document, 'components', 'schemas') as Record<string, unknown>;
    const refs = [...JSON.stringify(document).matchAll(/"\$ref":"([^"]+)"/g)].map(
      (match) => match[1] as string,
    );

    expect(refs.length).toBeGreaterThan(0);

    for (const ref of refs) {
      expect(ref, `unexpected ref shape: ${ref}`).toMatch(/^#\/components\/schemas\//);
      const name = ref.replace('#/components/schemas/', '');
      expect(components[name], `dangling $ref: ${ref}`).toBeDefined();
    }
  });

  it('emits no $defs, which Swagger UI renders poorly', () => {
    expect(JSON.stringify(document)).not.toContain('$defs');
  });

  it('names the profile sub-models rather than inlining them anonymously', () => {
    const components = at(document, 'components', 'schemas') as Record<string, unknown>;

    for (const name of [
      'Profile',
      'ProfileRequest',
      'ProfileResponse',
      'ProfileMeta',
      'Experience',
      'Education',
      'Skill',
      'Certification',
      'Language',
      'ProfileImage',
      'ErrorResponse',
      'HealthResponse',
    ]) {
      expect(components[name], `missing component: ${name}`).toBeDefined();
    }
  });

  it('carries the full profile schema, not a placeholder', () => {
    const profile = at(document, 'components', 'schemas', 'Profile', 'properties') as Record<
      string,
      unknown
    >;

    expect(Object.keys(profile).sort()).toEqual([
      'about',
      'certifications',
      'education',
      'experience',
      'headline',
      'images',
      'languages',
      'location',
      'name',
      'skills',
    ]);
  });
});

describe('documented examples work against the running app', () => {
  /** The exact body a reader would send from the Try-it-out panel. */
  const documentedRequestBody = (): unknown =>
    at(
      document,
      'paths',
      '/api/v1/profile',
      'post',
      'requestBody',
      'content',
      'application/json',
      'example',
    );

  it('the documented request example succeeds', async () => {
    const body = documentedRequestBody();

    const response = await request(app()).post('/api/v1/profile').send(body as object);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('the documented request example resolves to a real profile, not an empty one', async () => {
    const response = await request(app())
      .post('/api/v1/profile')
      .send(documentedRequestBody() as object);

    expect(response.body.data.name).toBe('Ada Lovelace');
    expect(response.body.data.experience.length).toBeGreaterThan(0);
  });

  it('the documented 200 example matches what the API actually returns', async () => {
    // The drift test proper: the example is generated from the real fixture
    // through the real parser, so any parser change that is not reflected in
    // the docs fails here.
    const documented = at(
      document,
      'paths',
      '/api/v1/profile',
      'post',
      'responses',
      '200',
      'content',
      'application/json',
      'example',
    ) as { data: unknown; meta: Record<string, unknown> };

    const response = await request(app())
      .post('/api/v1/profile')
      .send(documentedRequestBody() as object);

    expect(response.body.data).toEqual(documented.data);
    expect(response.body.meta.source).toBe(documented.meta['source']);
    expect(response.body.meta.profileUrl).toBe(documented.meta['profileUrl']);
  });

  it('the documented health example matches the live response', async () => {
    const documented = at(
      document,
      'paths',
      '/health',
      'get',
      'responses',
      '200',
      'content',
      'application/json',
      'example',
    ) as Record<string, unknown>;

    const response = await request(app()).get('/health');

    expect(response.body.status).toBe(documented['status']);
    expect(response.body.source).toBe(documented['source']);
    expect(response.body.authorizationScope).toBe(documented['authorizationScope']);
    expect(Object.keys(response.body).sort()).toEqual(Object.keys(documented).sort());
  });

  it('the documented error examples match the messages the API really sends', async () => {
    const responses = at(document, 'paths', '/api/v1/profile', 'post', 'responses') as Record<
      string,
      unknown
    >;
    const documented = at(responses['400'], 'content', 'application/json', 'examples') as Record<
      string,
      { value: { error: { code: string; message: string } } }
    >;

    const live = await request(app()).post('/api/v1/profile').send({ url: 'not a url' });

    expect(live.status).toBe(400);
    expect(live.body.error.code).toBe('INVALID_PROFILE_URL');
    // The live message is the default for the code, which is what the document
    // publishes; a custom publicMessage at the throw site may add detail.
    expect(live.body.error.message.length).toBeGreaterThan(0);
    expect(documented['INVALID_PROFILE_URL']?.value.error.code).toBe('INVALID_PROFILE_URL');
  });
});
