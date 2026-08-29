import { pino } from 'pino';
import { describe, expect, it } from 'vitest';

import { ConfigError, loadEnv } from '../src/config/env.js';
import { REDACTED_PLACEHOLDER, createLoggerOptions } from '../src/config/logger.js';

/** Captures pino output without touching stdout. */
function captureLog(payload: Record<string, unknown>): string {
  const lines: string[] = [];
  const logger = pino(createLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'test' }), {
    write: (line: string) => {
      lines.push(line);
    },
  });

  logger.info(payload, 'test');
  return lines.join('');
}

describe('loadEnv - SPEC §6 defaults', () => {
  it('applies every documented default', () => {
    expect(loadEnv({})).toEqual({
      PORT: 3000,
      HOST: '0.0.0.0',
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      PROFILE_SOURCE: 'fixture',
      RATE_LIMIT_MAX: 30,
      RATE_LIMIT_WINDOW_MS: 60_000,
      CACHE_TTL_SECONDS: 900,
      APIFY_ACTOR_ID: 'harvestapi/linkedin-profile-scraper',
      APIFY_PROFILE_SCRAPER_MODE: 'Profile details no email ($4 per 1k)',
      APIFY_TIMEOUT_MS: 30_000,
    });
  });

  it('coerces numeric variables from strings', () => {
    const env = loadEnv({ PORT: '8080', CACHE_TTL_SECONDS: '0', RATE_LIMIT_MAX: '5' });
    expect(env.PORT).toBe(8080);
    expect(env.CACHE_TTL_SECONDS).toBe(0);
    expect(env.RATE_LIMIT_MAX).toBe(5);
  });

  it('accepts silent as a log level', () => {
    expect(loadEnv({ LOG_LEVEL: 'silent' }).LOG_LEVEL).toBe('silent');
  });

  it('treats a blank value as absent so .env placeholders do not fail boot', () => {
    expect(loadEnv({ LINKEDIN_CLIENT_ID: '   ' }).LINKEDIN_CLIENT_ID).toBeUndefined();
  });

  it.each([
    ['PORT', 'not-a-number'],
    ['PORT', '70000'],
    ['LOG_LEVEL', 'chatty'],
    ['PROFILE_SOURCE', 'scraper'],
    ['NODE_ENV', 'staging'],
    ['RATE_LIMIT_MAX', '0'],
    ['CACHE_TTL_SECONDS', '-1'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => loadEnv({ [key]: value })).toThrow(ConfigError);
  });
});

describe('loadEnv - linkedin-oidc requires the three LINKEDIN_ variables', () => {
  const complete = (): Record<string, string> => ({
    PROFILE_SOURCE: 'linkedin-oidc',
    LINKEDIN_CLIENT_ID: 'client-id',
    LINKEDIN_CLIENT_SECRET: 'client-secret',
    LINKEDIN_REDIRECT_URI: 'https://example.test/callback',
  });

  it('rejects the source with none of them set', () => {
    expect(() => loadEnv({ PROFILE_SOURCE: 'linkedin-oidc' })).toThrow(ConfigError);
  });

  it.each([['LINKEDIN_CLIENT_ID'], ['LINKEDIN_CLIENT_SECRET'], ['LINKEDIN_REDIRECT_URI']])(
    'names %s when it is the only one missing',
    (missing) => {
      const source = complete();
      delete source[missing];

      try {
        loadEnv(source);
        expect.unreachable('expected loadEnv to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        expect((error as ConfigError).keys.join(' ')).toContain(missing);
      }
    },
  );

  it('accepts the source when all three are present', () => {
    expect(loadEnv(complete()).PROFILE_SOURCE).toBe('linkedin-oidc');
  });

  it('does not require them for the fixture source', () => {
    expect(loadEnv({ PROFILE_SOURCE: 'fixture' }).PROFILE_SOURCE).toBe('fixture');
  });
});

describe('loadEnv - apify requires its provider credentials', () => {
  const complete = (): Record<string, string> => ({
    PROFILE_SOURCE: 'apify',
    APIFY_API_TOKEN: 'apify_api_token_value',
  });

  it('rejects the source with no token set', () => {
    expect(() => loadEnv({ PROFILE_SOURCE: 'apify' })).toThrow(ConfigError);
  });

  it('names APIFY_API_TOKEN when it is missing', () => {
    try {
      loadEnv({ PROFILE_SOURCE: 'apify' });
      expect.unreachable('expected loadEnv to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).keys.join(' ')).toContain('APIFY_API_TOKEN');
    }
  });

  it('accepts the source with only the token, since the rest default', () => {
    expect(loadEnv(complete()).PROFILE_SOURCE).toBe('apify');
  });

  it('defaults the actor id to the one this build maps', () => {
    expect(loadEnv(complete()).APIFY_ACTOR_ID).toBe('harvestapi/linkedin-profile-scraper');
  });

  it('defaults the scraper mode and accepts an override', () => {
    expect(loadEnv(complete()).APIFY_PROFILE_SCRAPER_MODE).toBe(
      'Profile details no email ($4 per 1k)',
    );
    expect(
      loadEnv({ ...complete(), APIFY_PROFILE_SCRAPER_MODE: 'Full profile ($8 per 1k)' })
        .APIFY_PROFILE_SCRAPER_MODE,
    ).toBe('Full profile ($8 per 1k)');
  });

  it('accepts an overridden actor id', () => {
    expect(loadEnv({ ...complete(), APIFY_ACTOR_ID: 'someone/other-actor' }).APIFY_ACTOR_ID).toBe(
      'someone/other-actor',
    );
  });

  it('never prints a present token value when some OTHER key fails', () => {
    // The token is valid here; PORT is what fails. The secret must still not
    // appear in a message likely to be pasted into a log or an issue tracker.
    try {
      loadEnv({
        PROFILE_SOURCE: 'apify',
        APIFY_API_TOKEN: 'apify_api_SECRET_LEAK',
        PORT: 'not-a-port',
      });
      expect.unreachable('expected loadEnv to throw');
    } catch (error) {
      const message = (error as ConfigError).message;
      expect(message).not.toContain('apify_api_SECRET_LEAK');
      expect(message).toContain('PORT');
    }
  });

  it('names APIFY_API_TOKEN when it is blank rather than absent', () => {
    try {
      loadEnv({ PROFILE_SOURCE: 'apify', APIFY_API_TOKEN: '   ' });
      expect.unreachable('expected loadEnv to throw');
    } catch (error) {
      expect((error as ConfigError).message).toContain('APIFY_API_TOKEN');
    }
  });

  it('does not require apify credentials for the fixture source', () => {
    expect(loadEnv({ PROFILE_SOURCE: 'fixture' }).APIFY_API_TOKEN).toBeUndefined();
  });

  it('defaults the run timeout and accepts an override', () => {
    expect(loadEnv({}).APIFY_TIMEOUT_MS).toBe(30_000);
    expect(loadEnv({ APIFY_TIMEOUT_MS: '90000' }).APIFY_TIMEOUT_MS).toBe(90_000);
  });
});

describe('loadEnv - the failure message names keys only, never values', () => {
  it('names the failing keys', () => {
    try {
      loadEnv({ PORT: 'not-a-port', PROFILE_SOURCE: 'scraper' });
      expect.unreachable('expected loadEnv to throw');
    } catch (error) {
      const message = (error as ConfigError).message;
      expect(message).toContain('PORT');
      expect(message).toContain('PROFILE_SOURCE');
    }
  });

  it('never includes a value, because one of them may be a secret', () => {
    try {
      loadEnv({
        PORT: 'PORT_VALUE_LEAK',
        PROFILE_SOURCE: 'SOURCE_VALUE_LEAK',
        LINKEDIN_CLIENT_SECRET: 'SECRET_VALUE_LEAK',
      });
      expect.unreachable('expected loadEnv to throw');
    } catch (error) {
      const message = (error as ConfigError).message;
      expect(message).not.toContain('PORT_VALUE_LEAK');
      expect(message).not.toContain('SOURCE_VALUE_LEAK');
      expect(message).not.toContain('SECRET_VALUE_LEAK');
    }
  });
});

describe('logger redaction is a security control', () => {
  it.each([
    ['req.headers.authorization', { req: { headers: { authorization: 'Bearer LEAKED' } } }],
    ['req.headers.cookie', { req: { headers: { cookie: 'li_at=LEAKED' } } }],
    ['req.headers x-api-key', { req: { headers: { 'x-api-key': 'LEAKED' } } }],
    ['access_token', { access_token: 'LEAKED' }],
    ['accessToken', { accessToken: 'LEAKED' }],
    ['refresh_token', { refresh_token: 'LEAKED' }],
    ['refreshToken', { refreshToken: 'LEAKED' }],
    ['client_secret', { client_secret: 'LEAKED' }],
    ['clientSecret', { clientSecret: 'LEAKED' }],
    ['LINKEDIN_CLIENT_SECRET', { LINKEDIN_CLIENT_SECRET: 'LEAKED' }],
    ['APIFY_API_TOKEN', { APIFY_API_TOKEN: 'LEAKED' }],
    ['nested APIFY_API_TOKEN', { config: { APIFY_API_TOKEN: 'LEAKED' } }],
    ['password', { password: 'LEAKED' }],
    ['nested password', { user: { password: 'LEAKED' } }],
    ['nested token', { auth: { token: 'LEAKED' } }],
    ['nested apiKey', { config: { apiKey: 'LEAKED' } }],
    ['bare cookie', { cookie: 'LEAKED' }],
    ['bare authorization', { authorization: 'LEAKED' }],
  ])('redacts %s', (_label, payload) => {
    const output = captureLog(payload);

    expect(output).not.toContain('LEAKED');
    expect(output).toContain(REDACTED_PLACEHOLDER);
  });

  it('leaves non-sensitive fields intact', () => {
    const output = captureLog({ profileUrl: 'https://www.linkedin.com/in/x', cached: true });

    expect(output).toContain('https://www.linkedin.com/in/x');
    expect(output).toContain('cached');
  });

  it('attaches no pretty transport outside development', () => {
    const options = createLoggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'production' });
    expect(options.transport).toBeUndefined();
  });

  it('attaches no transport when silent, since there is no output to prettify', () => {
    const options = createLoggerOptions({ LOG_LEVEL: 'silent', NODE_ENV: 'development' });
    expect(options.transport).toBeUndefined();
  });
});
