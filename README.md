# LinkedIn Profile API

A hosted HTTPS API that accepts a LinkedIn profile URL and returns normalized, versioned profile JSON — with the data source treated as a swappable, explicitly-authorized dependency rather than a hardcoded assumption.

![Node](https://img.shields.io/badge/node-%3E%3D20-3c873a)
![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178c6)
![Express](https://img.shields.io/badge/Express-5.2-000000)
![Zod](https://img.shields.io/badge/Zod-4.4-3068b7)
![tests](https://img.shields.io/badge/tests-476%20passing-2ea043)
![license](https://img.shields.io/badge/license-ISC-blue)

---

## Live demo

| | |
|---|---|
| **API base** | <https://tross-linkedin-api-1poe.onrender.com> |
| **Swagger UI** | <https://tross-linkedin-api-1poe.onrender.com/api/v1/docs> |
| **Health** | <https://tross-linkedin-api-1poe.onrender.com/health> |
| **OpenAPI document** | <https://tross-linkedin-api-1poe.onrender.com/api/v1/openapi.json> |
| **Source** | <https://github.com/raghavv483/tross> |

> ### ⚠️ Read this before your first request — cold starts
>
> **The deployment runs on a free Render instance, which sleeps after ~15 minutes of inactivity. The first request after it sleeps takes 30–60 seconds to wake the container.** That is the platform spinning up, not the API hanging.
>
> On top of that, the live deployment uses the **`apify` provider source**, and a provider run takes a further **10–20 seconds**. So a cold `POST /api/v1/profile` can legitimately take **well over a minute** end to end.
>
> **Warm it first:**
>
> ```bash
> curl https://tross-linkedin-api-1poe.onrender.com/health
> ```
>
> Once that returns `{"status":"ok",...}` the instance is awake and subsequent requests are fast. The in-memory cache is also empty after every cold start, so the first lookup of any profile always costs a full provider run.

---

## Overview

Consumers of profile data — CRMs, ATSs, enrichment pipelines — need a single structured representation of a person's professional profile. A LinkedIn profile page contains that information, but as rendered HTML behind an authenticated, heavily rate-limited web application. **There is no first-party LinkedIn API, at any self-serve tier, that returns a third party's profile by URL.**

This project builds the service layer that sits in front of such a source: a hosted API that accepts a profile URL and returns clean, versioned, well-documented JSON, where "which source, authorized on what basis" is an explicit, swappable, self-describing property of the system.

What it deliberately is **not**: it contains no scraping machinery. No headless browser, no LinkedIn session-cookie replay, no internal-endpoint calls, no bot-detection avoidance. A source adapter's only outbound contract is a provider's documented HTTP API.

---

## Architecture

The whole design is organised around one question: **how much code has to change when the data source changes?**

The answer here is **one adapter file and its fixture.** That is not a claim — it was tested mid-build.

### The swap seam, proven

Partway through this build the live provider was replaced: **`dev_fusion/Linkedin-Profile-Scraper` → `harvestapi/linkedin-profile-scraper`**. The two actors differ in essentially everything:

| | dev_fusion | HarvestAPI |
|---|---|---|
| Input key | `profileUrls: [url]` | `profileScraperMode` + `queries: [url]` |
| Dates | strings, month-first `"09-2024"` | objects, `{ month: "Sep", year: 2024 }` |
| Current role | `jobStillWorking: true` | `endDate: { text: "Present" }` |
| Experience key | `experiences[]` | `experience[]` |
| Role title | `title` | `position` |
| Education degree | one `subtitle`, `"Bachelor of Technology, CCE"` | separate `degree` + `fieldOfStudy` |
| Skills | `skills[].title` | `skills[].name` |
| Images | single URL strings | `profilePicture.sizes[]` with real dimensions |
| Location | `addressWithCountry` string | `location` object |

**That swap touched exactly two files: the adapter (`ApifySource` + its mapper) and its test fixture.** `ProfileService`, the cache, every parser, the error taxonomy, the HTTP layer, the response envelopes and the OpenAPI document were untouched, and the fixture source kept working offline throughout. That is the abstraction earning its keep.

### Request flow

```mermaid
flowchart TD
    Client([Client]) -->|POST /api/v1/profile| RL[Rate limit · per IP<br/>/health and /docs exempt]
    RL --> BC[Body cap · 10 kb]
    BC --> V[validateBody · Zod<br/>replaces req.body with stripped result]
    V --> C[ProfileController]
    C --> S

    subgraph Domain
      S[ProfileService]
      S --> U[parseLinkedInProfileUrl<br/>SSRF boundary · host allowlist]
      U --> CACHE[(TtlCache<br/>keyed on canonical URL)]
      CACHE -->|miss| SRC
      CACHE -->|hit| ENV
    end

    subgraph Sources
      SRC{ProfileSource}
      SRC --> F[FixtureProfileSource<br/>offline, zero config]
      SRC --> A[ApifySource]
      A -->|HTTPS · Bearer token| H[[HarvestAPI Actor<br/>via Apify REST API]]
    end

    F --> P[parseRawProfile<br/>raw ➜ domain]
    H --> M[mapApifyProfile<br/>provider ➜ RawProfile]
    M --> P
    P --> VER[ProfileSchema.parse<br/>verify parser output]
    VER --> CACHE
    VER --> ENV[ProfileResponseSchema.parse<br/>Zod strips undeclared keys]
    ENV --> Client
    EH[errorHandler · single exit<br/>AppError ➜ code + message only] --> Client
```

### The four boundaries

| Boundary | File | What it guarantees |
|---|---|---|
| **Source** | `src/sources/ProfileSource.ts` | Takes `CanonicalProfileUrl`, never a string — an adapter *cannot* skip the SSRF check. Every source declares an `authorizationScope`, surfaced at `/health`. |
| **Shape** | `src/types/raw.ts` vs `profile.ts` | The public contract never inherits an upstream shape. Provider churn stops at the mapper. |
| **Failure** | `src/errors/AppError.ts` | One taxonomy, one exit point. Upstream causes ride in `cause` for logs and are never serialized. |
| **Leak** | `src/schemas/response.ts` | Every response is `.parse()`d before `res.json()`. Zod strips undeclared keys, so an upstream field cannot reach a client. |

---

## Tech stack

| Choice | Why |
|---|---|
| **Express 5** | Native async error propagation — no `express-async-errors` wrapper needed. |
| **Zod 4** | Single source of truth for validation, TypeScript types (`z.infer`) *and* the OpenAPI document (`z.toJSONSchema()`), so the docs cannot drift from the implementation. |
| **pino + pino-http** | `redact` turns "never log a token" from a discipline into configuration. |
| **Vitest 4 + supertest** | 476 tests, fully offline, in ~2 seconds. |
| **TypeScript 7** | `strict` plus `noUncheckedIndexedAccess`. No `any` in application code. |
| **In-memory TTL cache** | Deliberately not Redis — a single-instance read API does not need a network hop and a second deployable to demonstrate caching. The limitation is documented, not engineered around. |

---

## Data sources

Selected with `PROFILE_SOURCE`. The pipeline — validate → cache → source → parse → verify — is identical whichever is active; only the adapter changes.

| Source | Network | Credentials | What it returns |
|---|---|---|---|
| **`fixture`** *(default)* | None | None | Three local profiles: `complete-profile`, `sparse-profile`, `edge-profile`. Any other slug returns `404 PROFILE_NOT_FOUND`. |
| **`apify`** | Apify REST API | `APIFY_API_TOKEN` | Real public profile data by URL, via the `harvestapi/linkedin-profile-scraper` Actor. |
| `linkedin-oidc` | — | — | **Not implemented.** Sign In with LinkedIn returns the *authenticated user's own* name, picture and email only — it is not a lookup API. Selecting it fails fast at boot. |

> **The live deployment runs `PROFILE_SOURCE=apify`.** You can confirm it yourself — `GET /health` reports the active source and the basis on which it is allowed to return what it returns.

A fresh clone defaults to `fixture`, so the API and the whole test suite work end to end with **zero configuration and no paid provider**.

---

## API reference

Base URL: `https://tross-linkedin-api-1poe.onrender.com`

| Method | Path | Rate limited | Description |
|---|---|---|---|
| `POST` | `/api/v1/profile` | Yes | Retrieve a normalized profile |
| `GET` | `/health` | No | Liveness, active source, authorization scope |
| `GET` | `/api/v1/docs` | No | Swagger UI |
| `GET` | `/api/v1/openapi.json` | No | The raw OpenAPI 3.1 document |

![Swagger UI - POST /api/v1/profile](docs/images/swagger-endpoint.png)

*The `POST /api/v1/profile` operation in Swagger UI, with the request body pre-filled and Try-it-out enabled — requests execute against the live deployment straight from the browser.*

### `POST /api/v1/profile`

**Request**

```json
{ "url": "https://www.linkedin.com/in/raghav-khandelwal-3512412a5" }
```

| Field | Type | Rules |
|---|---|---|
| `url` | string | Required. Trimmed. 1-2048 characters. Must pass URL validation (see [Security](#security)). |

Unknown body keys are **stripped, not rejected**. The body is capped at 10 kb.

Casing, subdomain (`in.`, `uk.`), scheme, trailing slash, query string and fragment are all normalized away, so every variant of the same profile shares one cache entry.

**curl**

```bash
curl -X POST https://tross-linkedin-api-1poe.onrender.com/api/v1/profile \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.linkedin.com/in/raghav-khandelwal-3512412a5"}'
```

**PowerShell**

```powershell
Invoke-RestMethod -Uri 'https://tross-linkedin-api-1poe.onrender.com/api/v1/profile' `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"url":"https://www.linkedin.com/in/raghav-khandelwal-3512412a5"}' |
  ConvertTo-Json -Depth 10
```

**Response — `200`**

Real output from the live `apify` deployment. The 28-entry `skills` array and two of the four image renditions are elided for length, marked `...`; everything else is verbatim.

```json
{
  "success": true,
  "data": {
    "name": "Raghav khandelwal",
    "headline": "Full-Stack Developer | AI/RAG Systems & Microservices | Next.js, Node.js, Docker, LangGraph",
    "location": "Bharatpur, Rajasthan, India",
    "about": "As a Bachelor of Technology candidate in Computer and Communication Engineering at The LNM Institute of Information Technology, I actively contribute as a Member of Google Developer Groups on Campus...",
    "experience": [
      {
        "company": "Google Developer Groups on Campus - LNMIIT",
        "title": "Member",
        "description": null,
        "location": "Jaipur, Rajasthan, India",
        "startDate": "2024-09",
        "endDate": null,
        "isCurrent": true
      },
      {
        "company": "The LNM Institute of Information Technology",
        "title": "Student",
        "description": null,
        "location": "Jaipur, Rajasthan, India",
        "startDate": "2023",
        "endDate": null,
        "isCurrent": true
      },
      {
        "company": "The LNM Institute of Information Technology",
        "title": "Finance Convener",
        "description": null,
        "location": null,
        "startDate": "2025-08",
        "endDate": "2026-03",
        "isCurrent": false
      },
      {
        "company": "Divya Laxmi Pvt Ltd.",
        "title": "Intern",
        "description": "Developed a RAG-based backend system for the company website using vector embeddings and PostgreSQL for retrieval...",
        "location": null,
        "startDate": "2026-06",
        "endDate": "2026-07",
        "isCurrent": false
      }
    ],
    "education": [
      {
        "institution": "The LNM Institute of Information Technology",
        "degree": "Bachelor of Technology",
        "fieldOfStudy": "CCE",
        "description": null,
        "startDate": "2023",
        "endDate": "2027"
      },
      {
        "institution": "Motion Kota",
        "degree": null,
        "fieldOfStudy": null,
        "description": null,
        "startDate": "2022-08",
        "endDate": "2023-04"
      },
      {
        "institution": "St Peter's Sr Sec School Bharatpur",
        "degree": null,
        "fieldOfStudy": null,
        "description": null,
        "startDate": null,
        "endDate": "2022-03"
      }
    ],
    "skills": [
      { "name": "Retrieval-Augmented Generation (RAG)" },
      { "name": "Agentic AI Development" },
      { "name": "LangChain" },
      { "name": "LangGraph" },
      { "name": "Node.js" }
    ],
    "certifications": [],
    "languages": [],
    "images": [
      {
        "url": "https://media.licdn.com/dms/image/v2/D5603AQFQDfu_o532Ig/profile-displayphoto-shrink_800_800/...",
        "type": "profile",
        "width": 800,
        "height": 800
      },
      {
        "url": "https://media.licdn.com/dms/image/v2/D5603AQFQDfu_o532Ig/profile-displayphoto-shrink_100_100/...",
        "type": "profile",
        "width": 100,
        "height": 100
      }
    ]
  },
  "meta": {
    "source": "apify",
    "profileUrl": "https://www.linkedin.com/in/raghav-khandelwal-3512412a5",
    "cached": false,
    "retrievedAt": "2026-08-29T07:41:12.884Z"
  }
}
```

| `meta` field | Meaning |
|---|---|
| `source` | `name` of the active `ProfileSource` (`fixture` or `apify`) |
| `profileUrl` | Canonicalised form of the input — this is the cache key |
| `cached` | Whether this was served from the TTL cache |
| `retrievedAt` | ISO 8601 timestamp of this response |

### `GET /health`

Exempt from rate limiting. Surfaces the deployment's data-access basis so it is inspectable without reading the source.

```json
{
  "status": "ok",
  "uptime": 324,
  "source": "apify",
  "authorizationScope": "External profile data retrieved via the Apify LinkedIn Profile Scraper Actor over Apify's HTTP API. Not an official or LinkedIn-authorized API: use is subject to Apify's terms and to LinkedIn's policies, and the operator accepts that trade-off. Limitations: public profile fields only; freshness, completeness and availability are the provider's, not this service's; per-run cost and provider rate limits apply; no scraping, credential replay or bot-detection avoidance is performed by this codebase."
}
```

### `GET /api/v1/docs` and `GET /api/v1/openapi.json`

Swagger UI and the raw OpenAPI 3.1 document. Both are exempt from the rate limiter: they sit under the `/api/v1` prefix the limiter is mounted on, so they are registered *before* it and reading the reference never spends a client's request budget.

Every schema in the document is generated with `z.toJSONSchema()` from the same Zod schemas validation runs on, and every example is generated from real code paths — error bodies from `AppError`, the success body from a fixture run through the real parser. A test asserts the documented example still equals what the API actually returns, so the docs cannot silently drift.

---

## Response schema

Two guarantees a consumer can rely on:

- **Every scalar is nullable.** A missing value is `null`, never an absent key.
- **Every list is always present, possibly empty.** A missing section is `[]`, never `undefined`.

So a consumer never has to distinguish "missing key" from "null value".

![Swagger UI - 200 response schema](docs/images/swagger-response.png)

*The generated `ProfileResponse` model in Swagger UI. Sub-models — `Experience`, `Education`, `Skill`, `ProfileImage`, `PartialDate` — are hoisted into named components so the schema is browsable rather than one anonymous blob.*

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

  "skills":         [{ "name": "string" }],
  "certifications": [{ "name": "string | null", "issuer": "string | null",
                       "issueDate": "PartialDate | null", "credentialId": "string | null" }],
  "languages":      [{ "name": "string | null", "proficiency": "string | null" }],

  "images": [{ "url": "string", "type": "profile | background | null",
               "width": "number | null", "height": "number | null" }]
}
```

### `PartialDate`

`"YYYY-MM"` when month and year are known, `"YYYY"` when only the year is, `null` otherwise. **Never** a partially-interpolated string like `"2022-undefined"`, and an out-of-range month degrades to year-only. The pattern is regex-enforced on the way out, so a mapper that produces anything else fails verification rather than shipping it.

### Normalization rules

| Rule | Behaviour |
|---|---|
| Empty / whitespace-only strings | become `null`, never `""` |
| Positions grouped by company | flattened — one group with N roles yields N `experience` entries, each carrying the group's company |
| `companyName` absent | falls back to the nested company name |
| Position group with empty elements | dropped entirely |
| `isCurrent` | a source-declared flag wins (HarvestAPI's `endDate.text: "Present"`); otherwise derived — `true` when a start exists and no end, `false` when an end exists, `null` when there is no date information at all |
| Image artifacts | artifacts with no usable path are dropped |
| Artifact with a path but no root URL | dropped, unless already absolute — an unresolvable relative URL is worse for a consumer than an absent entry |
| Skills with no usable name | dropped, since `skills[].name` is non-nullable |
| `location` | `"City, Country"` when both present, otherwise whichever exists, otherwise `null` |

### Deviation from the brief

`images[]` adds `width` and `height`. A consumer choosing between a 100 px and an 800 px rendition should not have to parse the URL to do it — and with HarvestAPI's `sizes[]` array those dimensions are real, not inferred.

> **Note on the Swagger example vs the live deployment.** The `200` example in Swagger UI is generated from the **fixture** profile (Ada Lovelace), while the live deployment serves **apify** data (shown above). Both conform to exactly the same schema — that is the point of the shape boundary. The example is fixture-derived so the document can be built at boot without making a paid provider call.

---

## Error handling

Every failure returns exactly this shape, and nothing else:

```json
{ "success": false, "error": { "code": "INVALID_PROFILE_URL", "message": "..." } }
```

No stack traces, no upstream payloads, no additional keys. `src/middleware/errorHandler.ts` is the only place in the codebase that writes an error body, and the error schema has no field for a stack or a cause — absence from the schema is what makes leaking one structurally impossible, rather than a rule someone has to remember.

| Code | HTTP | Raised when |
|---|---|---|
| `INVALID_PROFILE_URL` | 400 | The `url` field is absent, or fails URL validation |
| `INVALID_REQUEST_BODY` | 400 | The body could not be read at all: malformed JSON, wrong content type, or over the 10 kb cap |
| `PROFILE_NOT_FOUND` | 404 | No profile for this URL; also unmatched routes |
| `SOURCE_UNAUTHORIZED` | 403 | The source is not authorized at all — typically misconfiguration |
| `SOURCE_NOT_AUTHORIZED_FOR_URL` | 403 | The source is healthy and authorized, but not for *this* profile |
| `SOURCE_RATE_LIMITED` | 429 | The upstream provider is throttling us |
| `RATE_LIMITED` | 429 | *Our* per-IP limit was exceeded |
| `SOURCE_UNAVAILABLE` | 503 | Provider unreachable or timed out |
| `UPSTREAM_ERROR` | 502 | Provider returned an error |
| `MALFORMED_SOURCE_RESPONSE` | 502 | The provider returned a non-object, or the parser's output failed schema verification |
| `INTERNAL_ERROR` | 500 | Anything unrecognised — a fixed message that describes nothing |

### Distinctions that are deliberate

**`INVALID_REQUEST_BODY` vs `INVALID_PROFILE_URL`** — both are 400s, but they send a client to different places. The first means the request never parsed; the second means it parsed and the URL was wrong. Collapsing them would tell someone who sent a 12 kb body to go and check their LinkedIn URL.

**`PROFILE_NOT_FOUND` is reserved for an empty provider dataset** — the provider genuinely reporting no such profile. A **404 from the provider's API means the Actor does not exist**, i.e. a bad `APIFY_ACTOR_ID`, so it maps to `UPSTREAM_ERROR` instead. Reporting that as `PROFILE_NOT_FOUND` would send an operator with a typo'd actor id hunting for a problem with the profile URL.

**`SOURCE_UNAUTHORIZED` covers 402.** Apify returns `402 Payment Required` when an account is out of credit. That is not an upstream outage — the run was never authorized — so an operator sees the real cause instead of a generic 502.

**`MALFORMED_SOURCE_RESPONSE` is raised at two distinct points.** Because every scalar is nullable and every list defaults to `[]`, garbage would parse *cleanly* into a valid empty profile — so the parser cannot be the thing that detects it, and parsers are forbidden from throwing. `ProfileService` therefore rejects a non-object provider response **before** parsing, and `ProfileSchema.parse` **after** parsing catches a genuine bug in the parser itself. Both surface as 502; neither is the parser's responsibility.

**`SOURCE_UNAUTHORIZED` vs `SOURCE_NOT_AUTHORIZED_FOR_URL`** — the second is the normal, expected answer from a self-scoped source such as OIDC, and is not a fault.

### Provider errors never leak

Only the provider's **HTTP status code** is read from a failed response — the body is never parsed into a message. The API token, request headers and the provider's raw error payload never appear in a response. A test drives a planted token through the 401, 429, 500, network-failure and malformed-response paths and asserts the public body contains neither the token nor the string `Bearer`, and has exactly the keys `code` and `message`. Diagnostics that *are* useful (`reason`, `receivedType`, the item keys actually seen) go to the log context only.

---

## Configuration

Validated once at boot with Zod. **Invalid configuration throws before the server binds, and the error names the failing keys only — never their values**, because one of them may be a secret and boot errors are the single most likely thing to end up pasted into a chat, a CI log or an issue tracker.

| Variable | Default | Required | Notes |
|---|---|---|---|
| `PORT` | `3000` | No | |
| `HOST` | `0.0.0.0` | No | |
| `NODE_ENV` | `development` | No | `development` enables pretty logs |
| `LOG_LEVEL` | `info` | No | incl. `silent` — note a silent server looks dead but is running |
| `PROFILE_SOURCE` | `fixture` | No | `fixture` \| `apify` \| `linkedin-oidc` |
| `RATE_LIMIT_MAX` | `30` | No | per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | No | |
| `CACHE_TTL_SECONDS` | `900` | No | `0` disables caching entirely — nothing is stored |
| `APIFY_API_TOKEN` | — | **Yes, when `PROFILE_SOURCE=apify`** | **Secret.** Redacted in logs, never returned. The only Apify variable with no safe default. |
| `APIFY_ACTOR_ID` | `harvestapi/linkedin-profile-scraper` | No | Converted to the tilde form for the API path. Change it only alongside a mapper that matches its output. |
| `APIFY_PROFILE_SCRAPER_MODE` | `Profile details no email ($4 per 1k)` | No | The Actor's own input mode — selects field set and price tier |
| `APIFY_TIMEOUT_MS` | `30000` | No | Max wait for a run before `SOURCE_UNAVAILABLE` |
| `LINKEDIN_CLIENT_ID` | — | Only for `linkedin-oidc` | |
| `LINKEDIN_CLIENT_SECRET` | — | Only for `linkedin-oidc` | **Secret.** Redacted in logs. |
| `LINKEDIN_REDIRECT_URI` | — | Only for `linkedin-oidc` | |

Blank values are treated as absent, so a `APIFY_API_TOKEN=` placeholder in a `.env` file does not fail boot with a confusing "must be at least 1 character".

Example of a fail-fast boot, exactly as printed:

```
Invalid environment configuration. Check these variables: APIFY_API_TOKEN (custom).
Values are omitted from this message because one of them may be a secret.
```

---

## Run locally

Requires **Node >= 20**.

```bash
git clone https://github.com/raghavv483/tross.git
cd tross
npm install

# Optional: the defaults already work with zero configuration
cp .env.example .env

npm run dev
```

The server starts on <http://localhost:3000> with `PROFILE_SOURCE=fixture` — no credentials, no network calls. Try it:

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/api/v1/profile \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.linkedin.com/in/complete-profile"}'
```

The three fixture slugs are `complete-profile`, `sparse-profile` and `edge-profile`. Anything else returns `404 PROFILE_NOT_FOUND`.

| Script | What it does |
|---|---|
| `npm run dev` | `tsx watch`, loads `.env` if present |
| `npm test` | Vitest — **476 tests, fully offline** |
| `npm run typecheck` | `tsc --noEmit` over `src/` and the test config |
| `npm run build` | Compiles to `dist/` |
| `npm start` | `node dist/server.js` |

---

## Deployment

Deployed on **Render**. Any host that runs a long-running Node process over HTTPS works; serverless platforms do not, because the in-memory cache and the graceful-shutdown handler both assume a persistent process.

| Setting | Value |
|---|---|
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `node dist/server.js` |
| Health check path | `/health` |
| Host / port | `0.0.0.0`, port read from `PORT` |
| Secrets | Platform environment variables only — `.env` is never deployed or committed |

### The start command is load-bearing

Use `node dist/server.js`, **not `npm start`.** Under `npm start`, npm becomes PID 1 and does not reliably forward `SIGTERM` to the node child. The shutdown handler never fires, in-flight requests are cut mid-response on every redeploy, and **nothing appears in the logs to indicate it**. Invoking node directly is the entire fix.

`--include=dev` is required because TypeScript is a dev dependency and Render sets `NODE_ENV=production`, which would otherwise skip it and break the build.

### Cold starts, again

The free instance sleeps after ~15 minutes idle. The first request then takes **30–60 seconds** to wake it, plus **10–20 seconds** for the provider run. Hit `/health` first. The cache is also empty after every cold start, so the first lookup of any profile always costs a full provider run — expected, not a defect.

---

## Security

### The SSRF boundary

`src/utils/linkedinUrl.ts` is the **only** place a user-supplied URL is interpreted. It returns a branded `CanonicalProfileUrl`, and `ProfileSource.getProfile()` takes that type rather than a string — so a future adapter *cannot* parse the raw input itself and quietly skip the host allowlist. The type system prevents it.

Accepted: `http`/`https`, host exactly `linkedin.com` or a **true subdomain** of it, path matching `/in/<slug>`. The host check is exact-match or true-subdomain — never a substring test, which would admit both of the first two rows below.

| Rejected input | Why |
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

Also rejected, from testing URL-normalization tricks: `linkedin.com\@evil.com` (backslash normalizes to userinfo), `www.linkedin.com%2eevil.com` (percent-encoded dot), `/in/%2e%2e` (encoded dot segments), and a default port written explicitly as `:443`. Query strings are **stripped rather than rejected**, so an SSRF payload in `?next=` cannot survive into the URL a provider is handed.

### Everything else

| Control | Implementation |
|---|---|
| **Body cap** | `express.json({ limit: '10kb' })` — the only valid request is one short URL |
| **Rate limiting** | Per IP, `express-rate-limit`. `trust proxy` is `1` (not `true`) so a client cannot forge `X-Forwarded-For` to evade it. Rejected requests count, so an invalid URL cannot be used to probe for free. |
| **Secret redaction** | pino `redact` covers auth/cookie/api-key headers, both `camelCase` and `snake_case` OAuth token spellings, client secrets, and `APIFY_API_TOKEN` by name — pino matches exact keys, so the generic `token` path does not cover it. Treated as a security control, not formatting. |
| **Response leak guard** | Every success response is `.parse()`d against a Zod envelope before `res.json()`. Zod strips undeclared keys, so an unexpected upstream field cannot reach a client even if it survived the parser. |
| **No secrets in the repo** | `.env` is gitignored; `.env.example` carries empty placeholders only. No token appears in any tracked file. |
| **No open proxy** | The service fetches nothing but the configured provider's API, and only for URLs that already passed the allowlist. |

---

## Testing

**476 tests across 10 files, fully offline.** `npm test` makes no network call of any kind — `api.apify.com` appears nowhere under `tests/`.

| Area | Coverage |
|---|---|
| URL validation | Every SSRF row above, plus normalization tricks, canonicalization, and the assertion that casing/subdomain variants collapse to one cache key |
| Parsers | Every normalization rule, `PartialDate` edge cases, and 19 hostile inputs (`null`, `42`, `'a string'`, arrays where objects belong) each asserted to still yield a schema-valid profile rather than throwing |
| Config | Defaults, fail-fast per source, and that a boot error never prints a secret value |
| Logger | A planted `LEAKED` sentinel pushed through every redact path |
| Cache | TTL expiry on an injected clock, `ttlMs <= 0` storing nothing, bounded eviction |
| Service | Every failure mode driven by an injected stub source — no network mocking |
| HTTP | supertest against `createApp()` in-process; no port is ever bound |
| Apify adapter | 105 tests against the **real captured provider output**, with HTTP injected |
| Docs | That the documented example still equals what the API actually returns |

Two deliberate choices worth calling out:

- **Failure modes are driven by injected stubs, not network mocks.** `ProfileService` takes its source and cache as constructor arguments, so a test can make a source throw `SOURCE_RATE_LIMITED` or return a non-object without any HTTP layer involved at all.
- **The Apify fixture is a real captured run**, not a hand-written approximation. An earlier reconstruction-from-description turned out to disagree with reality in several fields; the fixture now carries a provenance comment saying exactly where it came from.

```
 Test Files  10 passed (10)
      Tests  476 passed (476)
```

---

## Known limitations

Stated plainly, because the data-source position is the architecturally significant fact about this project.

**1. The live source is a third-party provider, not an official API.**
`PROFILE_SOURCE=apify` retrieves data through **HarvestAPI**, a third-party Actor reached over **Apify's documented HTTP API**. It is **not** an official, LinkedIn-sanctioned or LinkedIn-authorized API, and this README does not imply otherwise. Use is subject to **Apify's terms and to LinkedIn's policies**, and that trade-off is the operator's to accept. The same statement is machine-readable at `/health` via `authorizationScope`.

**2. There is no first-party alternative.**
No LinkedIn API at any self-serve tier returns a third party's profile by URL. Sign In with LinkedIn (OIDC) returns the *authenticated user's own* name, picture and email and nothing else; fuller fields sit behind partner programmes with multi-week review. That is why `linkedin-oidc` remains deliberately unimplemented rather than pretending to be a lookup source.

**3. No scraping lives in this repository.**
No headless browser, no session-cookie replay, no internal-endpoint calls, no CAPTCHA or bot-detection avoidance. The provider performs collection on its side under its own terms; this codebase issues one authenticated HTTP request and normalizes the result. That boundary is deliberate: the liability of running a scraper against LinkedIn is not carried by this code or the account that deploys it.

**4. Provider runs cost money.**
Each `apify` lookup is a paid Actor run on the provider side. The default source is `fixture` precisely so a fresh clone, the test suite and local development never touch a paid provider or the network.

**5. Data quality is the provider's.**
Freshness, completeness and availability are HarvestAPI's, not this service's. Fields legitimately vary between profiles — which is why every scalar is nullable and every list defaults to `[]`.

**6. The cache is per-instance and volatile.**
In-memory, bounded to 1000 entries with oldest-insertion eviction, cleared on every restart and every cold start. Deliberately not Redis: a single-instance read API does not need a network hop and a second deployable to demonstrate caching. Horizontal scaling would need a shared cache.

**7. `certifications` and `languages` mappings are inferred.**
Both arrays were empty in the captured profile, so their inner field names are best-effort and defensive. They are held to "produces `[]` and never throws" rather than exact field fidelity, and are commented as such in the mapper. They need revisiting against a profile that populates them.

**8. Cold starts on the free tier.** See the warning at the top.

**9. The graceful-shutdown signal path is untested on Windows.**
The handler logic is unit-tested by emitting `SIGTERM`/`SIGINT` directly, but Windows has no POSIX signals, so end-to-end signal delivery could only be verified on the deployed Linux instance.

---

## Manual live smoke test

Only for verifying a real provider run. **Every value below is a placeholder — never commit a real token.**

```bash
# 1. Build
npm ci --include=dev && npm run build

# 2. Configure. Use a real token from https://console.apify.com/settings/integrations
export PROFILE_SOURCE=apify
export APIFY_API_TOKEN=apify_api_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX   # placeholder
export APIFY_ACTOR_ID=harvestapi/linkedin-profile-scraper          # default; can be omitted
export LOG_LEVEL=info

# 3. Start — node directly, never npm start
node dist/server.js
```

PowerShell equivalent:

```powershell
$env:PROFILE_SOURCE = 'apify'
$env:APIFY_API_TOKEN = 'apify_api_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'   # placeholder
$env:LOG_LEVEL = 'info'
node dist/server.js
```

Then verify, in order:

```bash
# a. The active source is reported as apify
curl http://localhost:3000/health

# b. A real lookup — expect 10-20s for the provider run
curl -X POST http://localhost:3000/api/v1/profile \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.linkedin.com/in/raghav-khandelwal-3512412a5"}'

# c. The same URL again — expect "cached": true and an instant response
```

What to check:

- `/health` reports `"source": "apify"` and the full `authorizationScope`.
- The first lookup returns `"cached": false`, the second `"cached": true`.
- The server log contains no token — grep it: `grep -c apify_api_ server.log` must print `0`.
- A bad token returns `403 SOURCE_UNAUTHORIZED`, not a 500, and the body contains only `code` and `message`.

Boot with `PROFILE_SOURCE=apify` and no token to confirm fail-fast:

```
Invalid environment configuration. Check these variables: APIFY_API_TOKEN (custom).
Values are omitted from this message because one of them may be a secret.
```

---

## Project layout

```
src/
  config/       env validation (secrets read here and nowhere else), logger + redact list
  types/        raw.ts = upstream shape · profile.ts = normalized domain (Zod)
  schemas/      request + response envelopes — the leak boundary
  sources/      ProfileSource interface, FixtureProfileSource, ApifySource + mapper, factory
  parsers/      raw ➜ normalized. Pure functions, one per section, no I/O
  services/     ProfileService — validate ➜ cache ➜ source ➜ parse ➜ verify ➜ store
  controllers/  HTTP in/out only
  routes/       route table
  middleware/   body validation, the single error exit
  docs/         OpenAPI generation + Swagger UI mount
  utils/        URL validation (SSRF boundary), TTL cache, graceful shutdown
tests/          Vitest — fixture-driven, no network
```

---

## License

ISC.
