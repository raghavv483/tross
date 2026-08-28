import { describe, expect, it } from 'vitest';

import { AppError } from '../src/errors/AppError.js';
import { parseLinkedInProfileUrl } from '../src/utils/linkedinUrl.js';

/** Asserts a rejection is the SSRF boundary's 400, not some incidental throw. */
const expectRejected = (input: unknown): AppError => {
  let thrown: unknown;
  try {
    parseLinkedInProfileUrl(input);
  } catch (error) {
    thrown = error;
  }

  expect(thrown, `expected ${JSON.stringify(input)} to be rejected`).toBeInstanceOf(AppError);
  const appError = thrown as AppError;
  expect(appError.code).toBe('INVALID_PROFILE_URL');
  expect(appError.statusCode).toBe(400);
  return appError;
};

describe('parseLinkedInProfileUrl', () => {
  describe('SPEC §3 rejection table', () => {
    const table: readonly (readonly [string, string])[] = [
      ['https://evil-linkedin.com/in/x', 'suffix confusion'],
      ['https://linkedin.com.evil.com/in/x', 'prefix confusion'],
      ['http://169.254.169.254/in/x', 'cloud metadata endpoint'],
      ['http://localhost/in/x', 'loopback'],
      ['file:///etc/passwd', 'non-HTTP scheme'],
      ['https://user:pass@www.linkedin.com/in/x', 'embedded credentials'],
      ['https://www.linkedin.com:8080/in/x', 'explicit port'],
      ['https://www.linkedin.com/company/tross', 'not a profile path'],
      ['https://www.linkedin.com', 'no profile path'],
    ];

    it.each(table)('rejects %s (%s)', (input) => {
      expectRejected(input);
    });
  });

  describe('further SSRF and confusion vectors', () => {
    const table: readonly (readonly [string, string])[] = [
      ['http://127.0.0.1/in/x', 'loopback by IP'],
      ['http://[::1]/in/x', 'loopback by IPv6'],
      ['http://10.0.0.1/in/x', 'private range'],
      ['http://metadata.google.internal/in/x', 'GCP metadata host'],
      ['https://www.linkedin.com.evil.com/in/x', 'canonical host as a prefix'],
      ['https://wwwlinkedin.com/in/x', 'missing dot'],
      ['https://www.linkedin.com\@evil.com/in/x', 'backslash normalizes to userinfo, host is evil.com'],
      ['https://evil.com\@www.linkedin.com/in/x', 'userinfo dressed as the real host'],
      ['https://www.linkedin.com%2eevil.com/in/x', 'percent-encoded dot in host'],
      ['https://www.linkedin.com/in/%2e%2e', 'encoded dot segments resolve away the path'],
      ['https://linkedin.com.', 'trailing dot host'],
      ['https://.linkedin.com/in/x', 'empty subdomain label'],
      ['https://www.linkedin.com:443/in/x', 'default port written explicitly'],
      ['javascript:alert(1)', 'javascript scheme'],
      ['data:text/html,<script>', 'data scheme'],
      ['ftp://www.linkedin.com/in/x', 'ftp scheme'],
      ['//www.linkedin.com/in/x', 'protocol-relative, unparseable without a base'],
      ['www.linkedin.com/in/x', 'schemeless'],
      ['https://www.linkedin.com/company/tross/about', 'company path'],
      ['https://www.linkedin.com/in/', 'empty slug'],
      ['https://www.linkedin.com/in/a/b', 'extra path segment'],
      ['https://www.linkedin.com/in/slug!', 'disallowed character in slug'],
      ['not a url', 'unparseable'],
      ['', 'empty string'],
      ['    ', 'whitespace only'],
    ];

    it.each(table)('rejects %s (%s)', (input) => {
      expectRejected(input);
    });

    it('rejects a slug longer than 100 characters', () => {
      expectRejected(`https://www.linkedin.com/in/${'a'.repeat(101)}`);
    });

    it('rejects a URL longer than 2048 characters', () => {
      expectRejected(`https://www.linkedin.com/in/${'a'.repeat(2100)}`);
    });

    it.each([[null], [undefined], [42], [{}], [['https://www.linkedin.com/in/x']]])(
      'rejects the non-string input %s',
      (input) => {
        expectRejected(input);
      },
    );
  });

  describe('acceptance and canonicalization', () => {
    const canonical = 'https://www.linkedin.com/in/complete-profile';

    const table: readonly (readonly [string, string])[] = [
      ['https://www.linkedin.com/in/complete-profile', canonical],
      ['https://www.linkedin.com/in/complete-profile/', canonical],
      ['http://linkedin.com/in/complete-profile/', canonical],
      ['https://linkedin.com/in/complete-profile', canonical],
      ['https://in.linkedin.com/in/Complete-Profile', canonical],
      ['https://uk.linkedin.com/in/COMPLETE-PROFILE/', canonical],
      ['https://WWW.LinkedIn.COM/in/Complete-Profile', canonical],
      ['  https://www.linkedin.com/in/complete-profile  ', canonical],
    ];

    it.each(table)('canonicalises %s', (input, expected) => {
      expect(parseLinkedInProfileUrl(input).href).toBe(expected);
    });

    it('strips a query string', () => {
      expect(
        parseLinkedInProfileUrl(
          'https://www.linkedin.com/in/complete-profile?originalSubdomain=in&trk=public',
        ).href,
      ).toBe(canonical);
    });

    it('strips a fragment', () => {
      expect(parseLinkedInProfileUrl(`${canonical}#experience`).href).toBe(canonical);
    });

    it('strips a query string and a fragment together, with a trailing slash', () => {
      expect(parseLinkedInProfileUrl(`${canonical}/?trk=abc#frag`).href).toBe(canonical);
    });

    it('discards a query string carrying an SSRF payload', () => {
      // The query is stripped rather than rejected, so the payload cannot
      // survive into the canonical URL a source is handed.
      const parsed = parseLinkedInProfileUrl(
        'https://www.linkedin.com/in/x?next=http://169.254.169.254',
      );
      expect(parsed.href).toBe('https://www.linkedin.com/in/x');
      expect(parsed.href).not.toContain('169.254');
    });

    it('accepts a host whose percent-encoding decodes to linkedin.com', () => {
      // %2e IS a dot — this really is linkedin.com, unlike the prefix-confusion
      // case where the decoded host is evil.com.
      expect(parseLinkedInProfileUrl('https://www.linkedin%2ecom/in/x').href).toBe(
        'https://www.linkedin.com/in/x',
      );
    });

    it('percent-encodes a literal space in the slug', () => {
      // SPEC §3 admits `%` in the slug charset so percent-encoded slugs work;
      // WHATWG parsing encodes the literal space before the pattern sees it.
      expect(parseLinkedInProfileUrl('https://www.linkedin.com/in/bad slug').slug).toBe(
        'bad%20slug',
      );
    });

    it('accepts a percent-encoded non-Latin slug', () => {
      expect(
        parseLinkedInProfileUrl('https://www.linkedin.com/in/%E5%BC%B5%E4%B8%89').href,
      ).toBe('https://www.linkedin.com/in/%e5%bc%b5%e4%b8%89');
    });

    it('tolerates a mixed-case scheme and stray whitespace', () => {
      expect(parseLinkedInProfileUrl('hTTps://WWW.LINKEDIN.COM/in/x').href).toBe(
        'https://www.linkedin.com/in/x',
      );
    });

    it('lowercases the slug', () => {
      expect(parseLinkedInProfileUrl('https://www.linkedin.com/in/Ada-Lovelace').slug).toBe(
        'ada-lovelace',
      );
    });

    it('preserves the permitted slug characters', () => {
      const parsed = parseLinkedInProfileUrl('https://www.linkedin.com/in/some_person.name-1');
      expect(parsed.slug).toBe('some_person.name-1');
      expect(parsed.href).toBe('https://www.linkedin.com/in/some_person.name-1');
    });

    it('accepts a slug of exactly 100 characters', () => {
      const slug = 'a'.repeat(100);
      expect(parseLinkedInProfileUrl(`https://www.linkedin.com/in/${slug}`).slug).toBe(slug);
    });

    it('gives casing and subdomain variants one identical cache key (SPEC §8 case 14)', () => {
      const keys = new Set(
        [
          'https://www.linkedin.com/in/complete-profile',
          'http://linkedin.com/in/complete-profile/',
          'https://in.linkedin.com/in/Complete-Profile',
          'https://WWW.LinkedIn.com/in/COMPLETE-PROFILE/?trk=x',
        ].map((input) => parseLinkedInProfileUrl(input).href),
      );

      expect(keys.size).toBe(1);
    });
  });

  describe('error bodies (SPEC §8 case 18)', () => {
    it('never leaks a stack trace or the input into the public body', () => {
      const error = expectRejected('https://linkedin.com.evil.com/in/x?secret=hunter2');
      const body = error.toPublicJSON();

      expect(Object.keys(body).sort()).toEqual(['code', 'message']);
      expect(body.message).not.toContain('hunter2');
      expect(body.message).not.toContain('evil.com');
      expect(JSON.stringify(body)).not.toContain('at ');
    });
  });
});
