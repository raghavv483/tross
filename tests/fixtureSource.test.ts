import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/AppError.js';
import { parseRawProfile } from '../src/parsers/index.js';
import { loadEnv, type Env } from '../src/config/env.js';
import { FixtureProfileSource, createProfileSource } from '../src/sources/index.js';
import { ProfileSchema } from '../src/types/profile.js';
import { parseLinkedInProfileUrl } from '../src/utils/linkedinUrl.js';

const target = (slug: string) => parseLinkedInProfileUrl(`https://www.linkedin.com/in/${slug}`);

describe('FixtureProfileSource', () => {
  const source = new FixtureProfileSource();

  it('names itself for meta.source and /health', () => {
    expect(source.name).toBe('fixture');
  });

  it('declares an authorization scope stating it retrieves no real profile data', () => {
    expect(source.authorizationScope).toBe(
      'Local fixture data only. Performs no network requests and retrieves no real profile data.',
    );
  });

  it.each([['complete-profile'], ['sparse-profile'], ['edge-profile']])(
    'serves %s',
    async (slug) => {
      const raw = await source.getProfile(target(slug));
      expect(ProfileSchema.safeParse(parseRawProfile(raw)).success).toBe(true);
    },
  );

  it('resolves a canonicalised slug regardless of the input casing or subdomain', async () => {
    const raw = await source.getProfile(
      parseLinkedInProfileUrl('https://in.linkedin.com/in/Complete-Profile/'),
    );
    expect(parseRawProfile(raw).name).toBe('Ada Lovelace');
  });

  it('rejects an unknown slug with PROFILE_NOT_FOUND (SPEC §8 case 9)', async () => {
    await expect(source.getProfile(target('nobody-here'))).rejects.toMatchObject({
      code: 'PROFILE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('rejects with an AppError and nothing else', async () => {
    await expect(source.getProfile(target('nobody-here'))).rejects.toBeInstanceOf(AppError);
  });

  it('lists the slugs it can serve', () => {
    expect(FixtureProfileSource.availableSlugs).toEqual([
      'complete-profile',
      'sparse-profile',
      'edge-profile',
    ]);
  });
});

describe('createProfileSource', () => {
  /** Builds a validated Env for a given source, as boot would. */
  const envFor = (overrides: Record<string, string>): Env =>
    loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...overrides });

  /**
   * A fully-credentialed OIDC env. The credentials must be present or
   * `loadEnv` rejects first, and the factory - the thing under test here -
   * would never be reached.
   */
  const oidcEnv = (): Env =>
    envFor({
      PROFILE_SOURCE: 'linkedin-oidc',
      LINKEDIN_CLIENT_ID: 'client-id',
      LINKEDIN_CLIENT_SECRET: 'client-secret',
      LINKEDIN_REDIRECT_URI: 'https://example.test/callback',
    });

  it('builds the fixture source', () => {
    expect(createProfileSource(envFor({ PROFILE_SOURCE: 'fixture' })).name).toBe('fixture');
  });

  it('defaults to the fixture source when PROFILE_SOURCE is unset', () => {
    expect(createProfileSource(envFor({})).name).toBe('fixture');
  });

  it('builds the apify source when credentials are configured', () => {
    const source = createProfileSource(
      envFor({
        PROFILE_SOURCE: 'apify',
        APIFY_API_TOKEN: 'apify_api_token_value',
      }),
    );

    expect(source.name).toBe('apify');
    expect(source.authorizationScope).toContain('Apify');
  });

  it('throws for linkedin-oidc, which is deliberately not implemented', () => {
    expect(() => createProfileSource(oidcEnv())).toThrowError(/not implemented/);
  });

  it('throws a plain Error, not an AppError, because this fires at boot', () => {
    // The deliberate exception to invariant 2. This is a misconfiguration that
    // must stop the process before the server binds - it can never be reached
    // from a request, so it carries no HTTP status and no client-safe message.
    try {
      createProfileSource(oidcEnv());
      expect.unreachable('expected createProfileSource to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppError);
      expect((error as Error).message).toContain('PROFILE_SOURCE=linkedin-oidc');
    }
  });
});
