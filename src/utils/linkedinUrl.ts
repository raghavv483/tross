/**
 * URL validation — the SSRF boundary. SPEC.md §3.
 *
 * This module is the ONLY place a user-supplied URL is interpreted. It returns
 * a `CanonicalProfileUrl`, and `ProfileSource.getProfile()` takes that type
 * rather than a string, so an adapter cannot skip the host allowlist by
 * parsing the input itself. Never widen that signature to accept a raw string.
 *
 * Accepted:
 *   - scheme `http` or `https`
 *   - host exactly `linkedin.com`, or a true subdomain of it
 *   - path matching `^/in/<slug>/?$`
 *
 * The host check is exact-match or true subdomain. A substring check such as
 * `includes('linkedin.com')` would admit both `evil-linkedin.com` (suffix
 * confusion) and `linkedin.com.evil.com` (prefix confusion). Never do that.
 */
import { URL } from 'node:url';

import { AppError } from '../errors/AppError.js';

/**
 * Nominal brand. `brand` is declared but never exported, so a value of this
 * type cannot be constructed outside this module — the only way to hold a
 * `CanonicalProfileUrl` is to have passed it through `parseLinkedInProfileUrl`.
 */
declare const brand: unique symbol;

export interface CanonicalProfileUrl {
  readonly [brand]: 'CanonicalProfileUrl';
  /** `https://www.linkedin.com/in/<slug>` — no trailing slash. The cache key. */
  readonly href: string;
  /** The lowercased profile slug. */
  readonly slug: string;
}

/** Registrable domain the allowlist is anchored on. */
const LINKEDIN_APEX = 'linkedin.com';

/** Canonical host every accepted input normalizes to. */
const CANONICAL_HOST = 'www.linkedin.com';

const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/** SPEC.md §3. Anchored, and length-bounded to keep the slug sane. */
const PROFILE_PATH_PATTERN = /^\/in\/([A-Za-z0-9\-%_.]{1,100})\/?$/;

const MAX_URL_LENGTH = 2048;

const reject = (reason: string, cause?: unknown): AppError =>
  new AppError('INVALID_PROFILE_URL', {
    // Describes why the URL was rejected without echoing attacker-supplied
    // input back into the response body.
    publicMessage: `Invalid LinkedIn profile URL: ${reason}. Expected a URL of the form https://www.linkedin.com/in/<profile-slug>.`,
    cause,
  });

/**
 * Host allowlist: exact match on the apex, or a *true* subdomain of it.
 *
 * `evil-linkedin.com`     → false (does not end with ".linkedin.com")
 * `linkedin.com.evil.com` → false (apex is evil.com)
 * `in.linkedin.com`       → true
 * `.linkedin.com`         → false (empty subdomain label)
 */
const isAllowedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  if (host === LINKEDIN_APEX) return true;

  const suffix = `.${LINKEDIN_APEX}`;
  if (!host.endsWith(suffix)) return false;

  // Everything before ".linkedin.com" must be a non-empty label, and must not
  // itself start or end with a dot.
  const subdomain = host.slice(0, host.length - suffix.length);
  return subdomain.length > 0 && !subdomain.startsWith('.') && !subdomain.endsWith('.');
};

/**
 * Detects a port written in the input.
 *
 * `URL.port` is empty for a scheme's default port, so `:443` on https would be
 * invisible there. The rejection is on the *input* containing a port at all,
 * so the check reads the raw authority.
 */
const hasExplicitPort = (input: string): boolean => {
  const schemeSeparator = input.indexOf('://');
  if (schemeSeparator === -1) return false;

  const afterScheme = input.slice(schemeSeparator + 3);
  const authorityEnd = afterScheme.search(/[/?#]/);
  const authority = authorityEnd === -1 ? afterScheme : afterScheme.slice(0, authorityEnd);

  // Strip any userinfo; credentials are rejected separately.
  const at = authority.lastIndexOf('@');
  const hostPart = at === -1 ? authority : authority.slice(at + 1);

  if (hostPart.startsWith('[')) {
    const closing = hostPart.indexOf(']');
    return closing !== -1 && hostPart.slice(closing + 1).startsWith(':');
  }

  return hostPart.includes(':');
};

/**
 * Validates and canonicalises a user-supplied LinkedIn profile URL.
 *
 * `https://in.linkedin.com/in/Complete-Profile` and
 * `http://linkedin.com/in/complete-profile/` both canonicalise to
 * `https://www.linkedin.com/in/complete-profile`, so they share one cache
 * entry. Query strings and fragments are not part of the canonical form and
 * are discarded.
 *
 * @throws {AppError} `INVALID_PROFILE_URL` for every rejection in SPEC.md §3.
 */
export function parseLinkedInProfileUrl(input: unknown): CanonicalProfileUrl {
  if (typeof input !== 'string') {
    throw reject('expected a string');
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw reject('the URL is empty');
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    throw reject(`the URL exceeds ${MAX_URL_LENGTH} characters`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (cause) {
    throw reject('the URL could not be parsed', cause);
  }

  // Scheme first: this rejects file:, data:, gopher: and every other
  // non-HTTP transport before anything else is considered.
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw reject('only http and https URLs are accepted');
  }

  // Embedded credentials — https://user:pass@www.linkedin.com/in/x
  if (url.username !== '' || url.password !== '') {
    throw reject('the URL must not contain embedded credentials');
  }

  // Explicit port — https://www.linkedin.com:8080/in/x
  if (url.port !== '' || hasExplicitPort(trimmed)) {
    throw reject('the URL must not specify a port');
  }

  // Host allowlist. This is what rejects loopback, link-local and cloud
  // metadata addresses (169.254.169.254, localhost, ...) as well as suffix
  // and prefix confusion — none of them are linkedin.com or a subdomain of it.
  if (!isAllowedHost(url.hostname)) {
    throw reject('the host is not linkedin.com or a subdomain of it');
  }

  const pathMatch = PROFILE_PATH_PATTERN.exec(url.pathname);
  const rawSlug = pathMatch?.[1];

  if (rawSlug === undefined) {
    throw reject('the path is not a profile path of the form /in/<profile-slug>');
  }

  const slug = rawSlug.toLowerCase();

  return {
    href: `https://${CANONICAL_HOST}/in/${slug}`,
    slug,
  } as CanonicalProfileUrl;
}
