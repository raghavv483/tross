# Product Requirements

**Project:** LinkedIn Profile API
**Context:** Tross Software Engineer take-home assessment
**Deadline:** 31 August

---

## 1. Problem

Consumers of profile data — CRMs, ATSs, enrichment pipelines — need a single
structured representation of a person's professional profile. A LinkedIn
profile page contains that information, but as rendered HTML behind an
authenticated, heavily rate-limited web application. There is no first-party
API that returns a third party's profile by URL.

This project builds the service layer that *would* sit in front of such a
source: a hosted API that accepts a profile URL and returns clean, versioned,
well-documented JSON — with the data source itself treated as a swappable,
explicitly-authorized dependency rather than a hardcoded assumption.

## 2. Goals

- **G1** — Accept a LinkedIn profile URL over HTTPS and return normalized JSON.
- **G2** — Design a response schema that stays stable across data sources.
- **G3** — Make the data source swappable behind one interface.
- **G4** — Never crash on missing or malformed upstream data.
- **G5** — Be honest and explicit about what data can legitimately be obtained.
- **G6** — Be reviewable: a reader should understand the design in ten minutes.

## 3. Non-goals

- Bulk or batch profile retrieval
- Search, or resolving a person to a URL
- Persistence of retrieved profiles beyond a short in-process cache
- Authentication or multi-tenancy for the API's own consumers
- A frontend
- Any form of scraping, credential replay or anti-bot circumvention (see §7)

## 4. Users

| User | Need |
|---|---|
| **Reviewer (primary)** | Assess engineering judgement — layering, error handling, testing, security awareness — by reading the repo and calling the deployed endpoint. |
| **API consumer** | One POST returns predictable JSON with stable field names and no surprise nulls-vs-missing inconsistency. |
| **Future maintainer** | Add a new data source without touching HTTP, parsing or business logic. |

## 5. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| F1 | `POST /api/v1/profile` accepts `{ "url": string }` | Must |
| F2 | Return name, headline, location, about, experience, education, skills, certifications, languages, images | Must |
| F3 | Reject non-LinkedIn and non-profile URLs with a structured 400 | Must |
| F4 | Absent sections return `[]`; absent scalars return `null` | Must |
| F5 | `GET /health` returns status, uptime, active source and its authorization scope | Must |
| F6 | Every error returns `{ success: false, error: { code, message } }` | Must |
| F7 | Per-IP rate limiting with a 429 body matching F6 | Must |
| F8 | Response `meta` reports which source served the request and whether it was cached | Must |
| F9 | OpenAPI document generated from the same schemas used for validation | Should |
| F10 | Short-TTL cache keyed on the canonical profile URL | Should |
| F11 | An authorized live source (`linkedin-oidc`) selectable by environment | Could |

## 6. Non-functional requirements

- **N1** Publicly reachable over HTTPS.
- **N2** No credential, cookie, token or secret in the repository, in logs, or
  in any response body.
- **N3** No arbitrary-URL fetching. The service is not an open proxy.
- **N4** Request bodies capped at 10 kb.
- **N5** Boot fails fast and loudly on invalid configuration.
- **N6** Full test suite runs offline with no network access.
- **N7** Strict TypeScript. No `any` in application code.

## 7. Constraint: what data is actually obtainable

This is a product constraint, not an implementation detail, and it shapes what
ships.

| Access path | Returns | Available? |
|---|---|---|
| Sign In with LinkedIn (OIDC) | Authenticated user's own name, picture, email | Yes — self-serve, needs a dev app tied to a Company Page |
| Marketing / Talent partner APIs | Fuller profile fields, still self-only | No — multi-week partner review |
| Any first-party API, third party by URL | — | **Does not exist at any tier** |
| Third-party data vendors | Varies | Paid, business verification, contested compliance posture |
| Scraping / credential replay | Everything | **Excluded — see below** |

Scraping is out of scope by decision, not by inability. It breaches the
LinkedIn User Agreement, and the agreement binds the account holder
personally, so a working scraper is a liability attached to a real identity —
including one attached publicly to this repository. The build treats "which
source, authorized on what basis" as a first-class, self-describing property
of the system instead.

**Consequence for this deliverable:** the shipped API is fully functional
end to end against fixture data. Any live adapter is scoped strictly to what
its authorization actually covers, and says so at `/health`.

## 8. Acceptance criteria

- [ ] Deployed, publicly reachable over HTTPS
- [ ] `GET /health` returns 200 with the active source and its scope
- [ ] `POST /api/v1/profile` returns a schema-valid profile for each of the three fixtures
- [ ] A non-LinkedIn URL returns 400 `INVALID_PROFILE_URL`
- [ ] An unknown profile returns 404 `PROFILE_NOT_FOUND`
- [ ] Exceeding the rate limit returns 429 `RATE_LIMITED`
- [ ] Test suite passes offline
- [ ] No secret present anywhere in git history
- [ ] README documents setup, API, schema, design decisions and known limitations
- [ ] Limitations section states the data-source position plainly

## 9. Out of scope for v1

Redis or any shared cache, webhooks, batch endpoints, persistence,
API-consumer auth, per-consumer quotas, observability beyond structured logs.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Reviewer expected a working scraper and reads the fixture source as incomplete | README and `/health` lead with the reasoning; the swappable adapter shows the work was architectural, not avoided |
| OIDC adapter blocked on Company Page setup | Fixture source is the default and ships regardless; OIDC is `Could`, not `Must` |
| Over-engineering crowds out finished basics | Explicit non-goals in §3; no infrastructure added without a load-bearing reason |
| Time lost to environment friction | Known gotchas recorded in `CLAUDE.md` so they are not rediscovered |