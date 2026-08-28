# Technical Specification

Version `v1`. All paths relative to the deployment base URL.
Content type is `application/json` for every request and response.

---

## 1. `POST /api/v1/profile`

### Request

```json
{ "url": "https://www.linkedin.com/in/complete-profile/" }
```

| Field | Type | Rules |
|---|---|---|
| `url` | string | Required. Trimmed. 1–2048 chars. Must pass §3. |

Unknown body keys are stripped, not rejected. Body capped at 10 kb.

### Success — `200`

```json
{
  "success": true,
  "data": { "...": "see §2" },
  "meta": {
    "source": "fixture",
    "profileUrl": "https://www.linkedin.com/in/complete-profile",
    "cached": false,
    "retrievedAt": "2026-08-28T09:14:22.031Z"
  }
}
```

| `meta` field | Meaning |
|---|---|
| `source` | `name` of the active `ProfileSource` |
| `profileUrl` | Canonicalised form of the input — the cache key |
| `cached` | Whether this was served from the TTL cache |
| `retrievedAt` | ISO 8601 timestamp of this response |

### Error

```json
{ "success": false, "error": { "code": "INVALID_PROFILE_URL", "message": "..." } }
```

Every error response has exactly this shape. No stack traces, no upstream
payloads, no additional keys.

---

## 2. Profile schema

Every scalar is nullable. Every list is always present, possibly empty. A
consumer never has to distinguish "missing key" from "null value".

```jsonc
{
  "name":     "string | null",   // first + last, tolerant of either being absent
  "headline": "string | null",
  "location": "string | null",   // "City, Country", or whichever half exists
  "about":    "string | null",

  "experience": [{
    "company":     "string | null",
    "title":       "string | null",
    "description": "string | null",
    "location":    "string | null",
    "startDate":   "PartialDate | null",
    "endDate":     "PartialDate | null",
    "isCurrent":   "boolean | null"
  }],

  "education": [{
    "institution":  "string | null",
    "degree":       "string | null",
    "fieldOfStudy": "string | null",
    "description":  "string | null",
    "startDate":    "PartialDate | null",
    "endDate":      "PartialDate | null"
  }],

  "skills":         [{ "name": "string" }],          // non-nullable; unnamed entries dropped
  "certifications": [{ "name": "string | null", "issuer": "string | null",
                       "issueDate": "PartialDate | null", "credentialId": "string | null" }],
  "languages":      [{ "name": "string | null", "proficiency": "string | null" }],

  "images": [{
    "url":    "string",
    "type":   "\"profile\" | \"background\" | null",
    "width":  "number | null",
    "height": "number | null"
  }]
}
```

### `PartialDate`

`"YYYY-MM"` when month and year are known, `"YYYY"` when only the year is,
`null` otherwise. Never a partially-interpolated string. An out-of-range month
degrades to year-only.

### Normalization rules

| Rule | Behaviour |
|---|---|
| Empty / whitespace-only strings | become `null`, never `""` |
| Positions grouped by company | flattened — one group with N roles yields N `experience` entries, each carrying the group's company |
| `companyName` absent | falls back to `company.name` |
| Position group with empty `elements` | dropped entirely |
| `isCurrent` | `true` when a start exists and no end; `false` when an end exists; `null` when there is no date information at all |
| Image artifacts | `url` is `rootUrl + fileIdentifyingUrlPathSegment`; artifacts with no path segment are dropped |
| Artifact with a path segment but no `rootUrl` | dropped, unless the segment is already absolute. An unresolvable relative URL is worse for a consumer than an absent entry |
| Skills with no usable name | dropped, since `skills[].name` is non-nullable |
| `location` | `"City, Country"` when both present, otherwise whichever exists, otherwise `null` |

### Deviations from the brief

`images[]` adds `width` and `height`. A consumer choosing between a 100 px and
an 800 px artifact should not have to parse the URL to do it.

---

## 3. URL validation

This is the SSRF boundary. `src/utils/linkedinUrl.ts` is the only place a
user-supplied URL is interpreted.

**Accepted:** `http`/`https`, host exactly `linkedin.com` or a true subdomain
of it, path matching `^/in/([A-Za-z0-9\-%_.]{1,100})/?$`.

**Rejected**, all as `400 INVALID_PROFILE_URL`:

| Input | Reason |
|---|---|
| `https://evil-linkedin.com/in/x` | suffix confusion |
| `https://linkedin.com.evil.com/in/x` | prefix confusion |
| `http://169.254.169.254/in/x` | cloud metadata endpoint |
| `http://localhost/in/x` | loopback |
| `file:///etc/passwd` | non-HTTP scheme |
| `https://user:pass@www.linkedin.com/in/x` | embedded credentials |
| `https://www.linkedin.com:8080/in/x` | explicit port |
| `https://www.linkedin.com/company/tross` | not a profile path |
| `https://www.linkedin.com` | no profile path |

The host check is exact-match or true subdomain. A substring check would admit
the first two rows.

### Canonicalization

`https://in.linkedin.com/in/Complete-Profile` and
`http://linkedin.com/in/complete-profile/` both canonicalise to
`https://www.linkedin.com/in/complete-profile`, so they share one cache entry.
Slugs are lowercased.

---

## 4. Error codes

| Code | HTTP | Raised when |
|---|---|---|
| `INVALID_PROFILE_URL` | 400 | The `url` field is absent, or fails validation (§3) |
| `INVALID_REQUEST_BODY` | 400 | The body could not be read at all: malformed JSON, wrong content type, or over the 10 kb cap |
| `PROFILE_NOT_FOUND` | 404 | Source has no profile for this URL; also unmatched routes |
| `SOURCE_UNAUTHORIZED` | 403 | Source is not authorized at all — typically misconfiguration |
| `SOURCE_NOT_AUTHORIZED_FOR_URL` | 403 | Source is healthy and authorized, but not for *this* profile |
| `SOURCE_RATE_LIMITED` | 429 | Upstream is throttling us |
| `RATE_LIMITED` | 429 | *Our* per-IP limit was exceeded |
| `SOURCE_UNAVAILABLE` | 503 | Upstream unreachable or timed out |
| `UPSTREAM_ERROR` | 502 | Upstream returned an error |
| `MALFORMED_SOURCE_RESPONSE` | 502 | Either the source returned a non-object, or the parser's output failed domain-schema verification. See note below |
| `INTERNAL_ERROR` | 500 | Anything unrecognised |

`INVALID_REQUEST_BODY` and `INVALID_PROFILE_URL` are separated deliberately.
Both are 400s, but they send a client to different places: the first means the
request never parsed, the second means it parsed and the URL was wrong.
Collapsing them tells someone who sent a 12 kb body to go and check their
LinkedIn URL.

**`MALFORMED_SOURCE_RESPONSE` is raised at two distinct points.** Because every
scalar in the domain model is nullable and every list defaults to `[]`, garbage
input parses cleanly into a valid empty profile — so the parser cannot be the
thing that detects it, and invariant 5 forbids making it throw. `ProfileService`
must therefore reject a non-object raw response *before* parsing. The
`ProfileSchema.parse` verification *after* parsing catches a different failure:
a genuine bug in the parser itself. Both surface as 502; neither is the
parser's responsibility.

`SOURCE_UNAUTHORIZED` and `SOURCE_NOT_AUTHORIZED_FOR_URL` are deliberately
distinct — the second is the normal, expected answer from a self-scoped source
such as OIDC and is not a fault.

---

## 5. `GET /health`

```json
{
  "status": "ok",
  "uptime": 412,
  "source": "fixture",
  "authorizationScope": "Local fixture data only. Performs no network requests and retrieves no real profile data."
}
```

Exempt from rate limiting. `authorizationScope` is surfaced so the deployment's
data-access basis is inspectable without reading the source.

---

## 5b. `GET /api/v1/docs`

Swagger UI, served from an OpenAPI 3 document generated at boot via
`z.toJSONSchema()` over the same schemas used for request validation and
response envelopes. It therefore cannot drift from the implementation.

Exempt from rate limiting. Documents `POST /api/v1/profile`, `GET /health`,
the profile schema (§2) and every error code (§4).

## 5c. `GET /` — demo page (optional, F12)

A single static HTML file served by the same Express app. One URL input, one
submit button, formatted JSON output, and visible error rendering for the
non-200 cases.

Constraints: no framework, no bundler, no build step, no second deployment, no
new runtime dependency. It calls `POST /api/v1/profile` on its own origin, so
no CORS configuration is required. If it starts needing any of those, drop it —
it is a `Could`, and §4 of the error contract matters more.

## 6. Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `0.0.0.0` | |
| `NODE_ENV` | `development` | `development` enables pretty logs |
| `LOG_LEVEL` | `info` | incl. `silent` — note a silent server looks dead but is running |
| `PROFILE_SOURCE` | `fixture` | `fixture` \| `linkedin-oidc` |
| `RATE_LIMIT_MAX` | `30` | per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | |
| `CACHE_TTL_SECONDS` | `900` | `0` disables caching entirely — nothing is stored |
| `LINKEDIN_CLIENT_ID` | — | required only when `PROFILE_SOURCE=linkedin-oidc` |
| `LINKEDIN_CLIENT_SECRET` | — | as above |
| `LINKEDIN_REDIRECT_URI` | — | as above |

Validated once at boot. Invalid configuration throws before the server binds,
and the error names the failing **keys only** — never their values, since one
may be a secret.

---

### Cache bounds

The cache is capped at 1000 entries with oldest-insertion eviction. This is not
a performance optimisation. The key space is attacker-influenced — every
distinct valid slug produces a distinct key — so an unbounded map is a
memory-growth vector on a public endpoint. Expiry is evaluated on read rather
than by timer, so the cache never holds the event loop open.

## 7. Fixture source

Selected by `PROFILE_SOURCE=fixture`. Performs no network I/O.

| Slug | Exercises |
|---|---|
| `complete-profile` | All sections; one company group holding two roles; profile and background images |
| `sparse-profile` | Whole sections absent — must yield `[]`, not `undefined` |
| `edge-profile` | Empty strings, empty `elements` array, year-only date, unnamed skill, surname-only name, artifacts with no path segment |

Any other slug returns `404 PROFILE_NOT_FOUND`.

---

## 8. Test matrix

| # | Case | Expected |
|---|---|---|
| 1 | Valid URL, complete fixture | 200, schema-valid, 2 Tross experience entries |
| 2 | Valid URL, sparse fixture | 200, absent sections are `[]` |
| 3 | Valid URL, edge fixture | 200, empty strings are `null`, unnamed skill dropped |
| 4 | Malformed URL | 400 `INVALID_PROFILE_URL` |
| 5 | Non-LinkedIn host | 400 |
| 6 | SSRF vectors (§3 table) | 400 for each |
| 7 | Non-profile LinkedIn path | 400 |
| 8 | Missing / empty `url` field | 400 |
| 9 | Unknown slug | 404 `PROFILE_NOT_FOUND` |
| 10 | Stub source throws `SOURCE_UNAUTHORIZED` | 403 |
| 11 | Stub source throws `SOURCE_RATE_LIMITED` | 429 |
| 12a | Stub source returns a non-object (`null`, `42`, `'str'`, `[]`) | 502 `MALFORMED_SOURCE_RESPONSE` |
| 12b | Parser output fails `ProfileSchema.parse` | 502 `MALFORMED_SOURCE_RESPONSE` |
| 13 | Same URL twice | second response `meta.cached === true` |
| 14 | Casing / subdomain variants | share one cache entry |
| 15 | Exceed rate limit | 429 `RATE_LIMITED` |
| 16 | `GET /health` | 200 with source and scope |
| 17 | Unknown route | 404 |
| 18 | Error bodies | never contain a stack trace or upstream payload |

All run offline. Failure modes are driven by a stub `ProfileSource` injected
into `ProfileService`, not by network mocking.