/**
 * The source boundary. ARCHITECTURE.md.
 *
 * This is the seam the whole architecture is organised around: when the source
 * of profile data changes, exactly one adapter file and one `case` in
 * `src/sources/index.ts` change. Nothing else.
 */
import type { RawProfile } from '../types/raw.js';
import type { CanonicalProfileUrl } from '../utils/linkedinUrl.js';

export interface ProfileSource {
  /** Reported as `meta.source` and at `/health`. */
  readonly name: string;

  /**
   * The basis on which this source is permitted to retrieve the data it
   * returns. Surfaced at `/health` so a deployment's data-access position is
   * inspectable without reading the source.
   *
   * This is on the interface rather than in a comment on purpose: every source
   * must state its authorization, which makes the project's central constraint
   * a structural property of the code. If this string cannot be written
   * honestly for a proposed adapter, that adapter does not get written.
   */
  readonly authorizationScope: string;

  /**
   * Retrieves the raw upstream profile for an already-validated URL.
   *
   * Takes `CanonicalProfileUrl`, NEVER a string. By the time an adapter sees
   * this value it has passed the host allowlist in `src/utils/linkedinUrl.ts`.
   * A string parameter would let a future adapter parse the input itself and
   * quietly skip the SSRF boundary — the type system prevents that. Never
   * widen this signature.
   *
   * Implementations throw `AppError` and nothing else. In particular:
   *   - `PROFILE_NOT_FOUND`               no profile for this URL
   *   - `SOURCE_UNAUTHORIZED`             the source is not authorized at all
   *   - `SOURCE_NOT_AUTHORIZED_FOR_URL`   authorized, but not for this profile
   *   - `SOURCE_RATE_LIMITED`             upstream is throttling us
   *   - `SOURCE_UNAVAILABLE`              upstream unreachable or timed out
   *   - `UPSTREAM_ERROR`                  upstream returned an error
   */
  getProfile(target: CanonicalProfileUrl): Promise<RawProfile>;
}
