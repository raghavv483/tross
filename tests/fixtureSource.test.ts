import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/AppError.js';
import { parseRawProfile } from '../src/parsers/index.js';
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
  it('builds the fixture source', () => {
    expect(createProfileSource('fixture').name).toBe('fixture');
  });

  it('throws for linkedin-oidc, which is deliberately not implemented', () => {
    expect(() => createProfileSource('linkedin-oidc')).toThrowError(AppError);

    try {
      createProfileSource('linkedin-oidc');
      expect.unreachable('expected createProfileSource to throw');
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe('SOURCE_UNAUTHORIZED');
      expect(appError.statusCode).toBe(403);
      expect(appError.publicMessage).toContain('not implemented');
    }
  });
});
