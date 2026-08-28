/**
 * Orchestration: validate -> cache -> source -> parse -> verify -> store.
 *
 * Takes its source and cache as constructor arguments rather than importing a
 * singleton. That is what lets the test suite drive every failure mode with a
 * stub `ProfileSource` and no network mocking anywhere.
 */
import { AppError } from '../errors/AppError.js';
import { isRecord } from '../parsers/guards.js';
import { parseRawProfile } from '../parsers/index.js';
import type { ProfileSource } from '../sources/ProfileSource.js';
import { ProfileSchema, type Profile } from '../types/profile.js';
import type { TtlCache } from '../utils/cache.js';
import { parseLinkedInProfileUrl } from '../utils/linkedinUrl.js';

export interface ProfileResult {
  readonly profile: Profile;
  /** `name` of the source that served this. Becomes `meta.source`. */
  readonly source: string;
  /** Canonical URL - the cache key. Becomes `meta.profileUrl`. */
  readonly profileUrl: string;
  /** Whether this came from the cache. Becomes `meta.cached`. */
  readonly cached: boolean;
}

export class ProfileService {
  constructor(
    private readonly source: ProfileSource,
    private readonly cache: TtlCache<Profile>,
  ) {}

  get sourceName(): string {
    return this.source.name;
  }

  get authorizationScope(): string {
    return this.source.authorizationScope;
  }

  async getProfile(url: unknown): Promise<ProfileResult> {
    // 1. Validate. This throws INVALID_PROFILE_URL before any outbound call is
    //    possible, and returns the canonical form everything downstream uses.
    const target = parseLinkedInProfileUrl(url);

    // 2. Cache lookup, keyed on the canonical URL. Casing and subdomain
    //    variants of the same profile canonicalise to one key, so they share
    //    one entry.
    const hit = this.cache.get(target.href);
    if (hit !== undefined) {
      return { profile: hit, source: this.source.name, profileUrl: target.href, cached: true };
    }

    // 3. Fetch. The source receives CanonicalProfileUrl, never a string.
    //    An AppError from the source propagates untouched: PROFILE_NOT_FOUND,
    //    SOURCE_UNAUTHORIZED and the rest are the source's answer to give, not
    //    ours to reinterpret. A non-AppError throw is an adapter contract
    //    violation and is left to surface as a generic 500 rather than being
    //    dressed up as an upstream fault.
    const raw = await this.source.getProfile(target);

    // 4. Non-object guard. SPEC §4, §8 case 12a.
    //    This must happen BEFORE parsing. Every scalar in the domain model is
    //    nullable and every list defaults to [], so `null`, `42`, `'str'` or
    //    `[]` would each parse cleanly into a valid empty profile and be
    //    served as a confident 200 describing a person who does not exist.
    //    The parser cannot catch this - invariant 5 forbids it throwing - so
    //    the service is where it has to be caught.
    if (!isRecord(raw)) {
      throw new AppError('MALFORMED_SOURCE_RESPONSE', {
        context: {
          source: this.source.name,
          profileUrl: target.href,
          receivedType: raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw,
        },
      });
    }

    // 5. Normalize. Pure, and degrades rather than throwing.
    const parsed = parseRawProfile(raw);

    // 6. Verify the PARSER'S OWN OUTPUT. SPEC §4, §8 case 12b.
    //    A different failure from case 12a: this catches a genuine bug in the
    //    parser, so a defect surfaces as a clean 502 instead of a malformed
    //    200 that a consumer would have to discover for us.
    const verified = ProfileSchema.safeParse(parsed);

    if (!verified.success) {
      throw new AppError('MALFORMED_SOURCE_RESPONSE', {
        // The Zod issues go in `cause` for logging. They are never serialized
        // into a response - they can quote upstream values.
        cause: verified.error,
        context: { source: this.source.name, profileUrl: target.href },
      });
    }

    // 7. Store.
    this.cache.set(target.href, verified.data);

    return {
      profile: verified.data,
      source: this.source.name,
      profileUrl: target.href,
      cached: false,
    };
  }
}
