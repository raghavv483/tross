# CLAUDE.md

Operating instructions for AI agents working in this repository.

## What this project is

A hosted HTTPS API that accepts a LinkedIn profile URL and returns normalized
profile data as JSON. Built as a take-home assessment. The interesting part is
not the HTTP plumbing — it is the `ProfileSource` abstraction and the honest
handling of what profile data can and cannot legally be retrieved.

Read `PRD.md` for scope, `ARCHITECTURE.md` for structure, `SPEC.md` for the
exact API contract.

---

## Hard invariants — do not break these

These are not style preferences. Breaking one is a defect.

### 1. No unauthorized LinkedIn access, ever

Do **not** implement, suggest, or scaffold:

- session-cookie replay, `li_at` handling, or any credential-based scraping
- Voyager / internal endpoint calls
- CAPTCHA, MFA, anti-bot, or rate-limit circumvention
- headless-browser scraping as a workaround

Every `ProfileSource` implementation must declare an `authorizationScope`
string stating the basis on which it is permitted to retrieve the data it
returns. If you cannot write that string honestly, the adapter does not get
written. When blocked on this, stop and say so — do not route around it.

### 2. Errors only ever leave through `AppError`

`src/errors/AppError.ts` is the single taxonomy. Sources, services and parsers
throw `AppError`; never a bare `Error` and never an upstream error object.
Upstream causes go in `AppError.cause` for logging and are never serialized
into a response. `src/middleware/errorHandler.ts` is the only place that writes
an error body.

### 3. Outbound payloads are Zod-parsed

Every success response is built by `.parse()`-ing the envelope schema in
`src/schemas/response.ts` before `res.json()`. Zod strips undeclared keys, so
this is the structural guard against an upstream field leaking to a client.
Do not bypass it by constructing a response literal and sending it directly.

### 4. URL validation is the SSRF boundary

`src/utils/linkedinUrl.ts` is the only place a user-supplied URL is
interpreted. It returns a `CanonicalProfileUrl`. `ProfileSource.getProfile()`
takes that type, **not** a string — so an adapter cannot skip the host
allowlist by parsing the input itself. Never widen the signature to accept a
raw string.

The host check is exact-match or true subdomain. Never replace it with
`includes('linkedin.com')`.

### 5. Parsers degrade, they do not throw

Everything in `src/parsers/` must tolerate missing, empty and malformed input
and return `null` or `[]`. A parser that throws on a missing section is a bug.
Empty and whitespace-only strings become `null`, not `""`.

### 6. Secrets never reach logs or the repo

`src/config/logger.ts` has a `redact` list. Treat it as a security control:
when you add a field that could carry a token, cookie or secret, add its path
there in the same commit. Never `console.log` a request, a config object or an
error's `config`. Never commit `.env`.

---

## Commands

```bash
npm run dev        # tsx watch, loads .env if present
npm run build      # tsc -> dist/
npm start          # node dist/server.js
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

---

## Environment gotchas already paid for

These cost time once. Do not rediscover them.

| Issue | Resolution |
|---|---|
| TypeScript 7 does not pick up Node globals implicitly | `"types": ["node"]` is required in `tsconfig.json` |
| `URL` is not in scope with `lib: ["ES2022"]` | `import { URL } from 'node:url'` explicitly |
| `import pinoHttp from 'pino-http'` is not callable | use the named import: `import { pinoHttp } from 'pino-http'` |
| Vitest 4 removed the `basic` reporter | use the default reporter |
| Server appears dead with `LOG_LEVEL=silent` | it is running and bound; silent means zero output. Use `info` when smoke testing |
| ESM + `moduleResolution: nodenext` | **all relative imports need a `.js` extension**, even from `.ts` files |
| Long multi-file heredoc batches can time out mid-run | write files in small batches and `ls` to confirm they landed |

---

## Conventions

- **ESM throughout.** `"type": "module"`. Relative imports end in `.js`.
- **Zod is the single source of truth.** Domain types are inferred with
  `z.infer`, never hand-written alongside a schema. The OpenAPI document is
  generated from the same schemas via `z.toJSONSchema()`.
- **Dependency injection over imports for behaviour.** `ProfileService` takes
  its source and cache as constructor arguments. This is what lets tests drive
  failure modes with a stub instead of network mocking. Do not reach for a
  module-level singleton inside a service.
- **One concern per file.** `src/parsers/` exports one function per profile
  section so each is unit-testable against a fragment.
- **`strict` plus `noUncheckedIndexedAccess`.** Array access is
  `T | undefined`. Handle it; do not add non-null assertions to silence it.

## Where things go

```
src/config/      env validation, logger. Secrets are read here and nowhere else.
src/types/       raw.ts = upstream shape. profile.ts = normalized domain (Zod).
src/schemas/     request + response envelopes.
src/sources/     ProfileSource interface, adapters, fixtures, factory.
src/parsers/     raw -> normalized. Pure functions, no I/O.
src/services/    orchestration: validate -> cache -> source -> parse -> verify.
src/controllers/ HTTP in/out only. No business logic.
src/routes/      route table.
src/middleware/  validation, error handler.
src/utils/       URL validation (SSRF boundary), TTL cache.
tests/           vitest. Fixture-driven, no network.
```

Adding a data source touches exactly two files: the new adapter in
`src/sources/`, and one `case` in `src/sources/index.ts`. If a change requires
touching controllers or parsers, the abstraction has been violated — stop and
reconsider.

---

## Working style

- Do not generate the whole application in one step. Small logical changes.
- Run `npm run typecheck` after each batch. Run `npm test` before claiming done.
- **Never claim something works unless it has actually been executed.** If a
  command timed out, verify the files landed before reporting success.
- Surface errors rather than suppressing them. No empty `catch {}`.
- When a requirement conflicts with invariant 1, say so plainly rather than
  finding a technically-compliant workaround.

---

## Current status

Built and typechecking: config, logger, error taxonomy, URL validation, domain
schemas, raw types, three fixtures, fixture source, parsers, service, cache,
middleware, controller, routes, app, server.

Not yet done: test suite, OpenAPI document, `README.md`, deployment, and the
`linkedin-oidc` adapter (`src/sources/index.ts` throws for it today).