# CLAUDE.md

Guidance for AI coding agents (Claude Code, Cursor, Codex…) working on this
repository. `AGENTS.md` and `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`
are symlinks to this file — edit this one only.

User-facing documentation lives in [`docs/`](docs/README.md). Keep it in sync
when you change public behaviour.

## What Lyn is

Lyn is a small backend framework written in TypeScript that runs **only on
Bun**. It provides, on top of `Bun.serve`:

- a chainable route builder (`new Lyn().get(...).post(...).listen()`) with
  its own router,
- `app.handle(request)` to run a `Request` through the app without a server,
- Zod-based validation of `body`, `params` and `query`, with the handler
  context typed from the schemas,
- a uniform JSON error format (`LynError`),
- typed environment-variable loading at startup,
- pino logging.

It targets POCs, solopreneurs and agencies. Auth (better-auth + Postgres) is
planned but **not wired in yet**. The package is **not published** yet
(`version 0.0.1`, `module: src/index.ts`, no build step).

## Commands

Always use Bun. Never use node, npm, npx, pnpm, yarn, vite, jest or ts-node.

| Task                       | Command                                  |
| -------------------------- | ---------------------------------------- |
| Install deps               | `bun install`                            |
| Run the sandbox app (hot)  | `bun run dev` → `testing/local.ts` on :3000 (needs `NODE_ENV` set) |
| Run all tests              | `bun run test` (sets `NODE_ENV=lyn-test`) |
| Run one test file          | `NODE_ENV=lyn-test bun test test/validation.test.ts` |
| Coverage                   | `NODE_ENV=lyn-test bun test --coverage`  |
| Dead-code check            | `bun run deadcode` (knip)                |
| Type-check                 | `bunx tsc --noEmit`                      |
| Postgres + pgAdmin (future auth) | `docker compose up -d`             |

Prefer `bun run test`: Lyn's internal logs are only silenced when
`NODE_ENV=lyn-test`. Tests must still pass with any `NODE_ENV`, including
when run from an IDE runner.

Requires Bun `>= 1.3.6` (`engines` in `package.json`).

## Layout

```
src/
  index.ts     Lyn class (route builder, handle, listen/stop/url), public exports: Lyn, z, logger
  router.ts    Segment trie: path validation, matching, params extraction
  coerce.ts    coerceValue: string → number/boolean according to the zod field (unwraps .optional())
  query.ts     parseQuery: reads schema keys from URLSearchParams, coerceValue, safeParse
  params.ts    parseParams: coerceValue on router params, safeParse
  body.ts      readJsonBody: NO_BODY, JSON content type (415), JSON.parse (INVALID_JSON)
  cors.ts      CorsConfig, assertValidCorsConfig, applyCors (actual + preflight headers)
  request.ts   Route match → 404/405/OPTIONS, or lifecycle: validation → handler → response / error
  types.ts     All public & internal types (Context, Validation, RouteHandler, LynConfig…)
  env.ts       Env-var schema → parsed values, exits(1) on invalid/missing
  error.ts     LynError + concrete errors (VALIDATION, NO_BODY, INVALID_JSON, UNSUPPORTED_MEDIA_TYPE, NOT_FOUND, METHOD_NOT_ALLOWED, INTERNAL_SERVER_ERROR)
  logger.ts    `logger` (for users) and `internalLogger` (prefixed "[Lyn]")
  utils.ts     getDefaultStatusFromMethod
  lib/auth.ts  better-auth stub, not imported anywhere yet
test/          bun:test suites + constantsTest.ts (TEST_LYN_CONFIG)
testing/       local.ts (dev sandbox) and utilsTest.ts (createTestClient, built on app.handle)
test.ts        scratch Bun.serve file, not part of the framework
docs/          user documentation
```

Imports inside `src/` use the `#/*` → `./src/*` alias from `tsconfig.json`.
Tests import `test/...` and `testing/...` via `baseUrl: "."`.

## Architecture

### Route registration (`src/index.ts`)

- `get/post/put/delete(path, handler, validation?)` add a `Route` to the
  router and return `this`. `get` has no body generic.
- `handle(request)` is the single entry point: parse pathname →
  `router.match` → `handleRouteMatch`. Tests and `listen()` both use it.
- `listen(port = 0)` calls `Bun.serve({ fetch: req => this.handle(req), idleTimeout: 30 })`
  (Bun's native `routes` option is deliberately **not** used, so that
  `handle()` and the server cannot diverge), prints the ASCII logo unless
  `config.start.hideLynLogo`, sets `baseUrl = http://127.0.0.1:<port>`.
  Port `0` = random free port.
- `url` getter throws if `listen()` has not been called.
- Any number of `Lyn` instances may coexist (no singleton).

### Router (`src/router.ts`)

- `createRouter()` → `{ add(route), match(method, pathname) }`.
- Trie of path segments. Each node has `staticChildren`, one `paramChild`,
  one `wildcardChild`, and `routesByMethod`.
- `add` throws on: empty path, missing leading `/`, `*` not last, a params
  schema key that is not a `:param` of the path, same method on the same shape (`/:id` and `/:userId` share the param node → duplicate).
  Param names are stored per route, so different names at one position work.
- `match` walks depth-first with backtracking, priority static > param >
  wildcard. Empty segments are dropped (trailing/double slashes ignored).
  Params are `decodeURIComponent`-ed, raw if decoding fails.
- Returns `found` (route + params) | `method_not_allowed` (allowedMethods) | `not_found`.

### Request lifecycle (`src/request.ts`)

```
handleRouteMatch(request, pathname, match)
  ├─ not_found          → 404 NOT_FOUND
  ├─ method_not_allowed → OPTIONS ? 204 + Allow : 405 METHOD_NOT_ALLOWED + Allow
  └─ found              → handleRequestLifecycle(request, route, params)

handleRequestLifecycle
  └─ set = { headers: new Headers(), status: default for method }
  └─ handleRequest
       body   → readJsonBody: body? JSON content type? JSON.parse, safeParse  → NO_BODY / UNSUPPORTED_MEDIA_TYPE / INVALID_JSON / VALIDATION
       params → parseParams: coerce per field, safeParse                       → VALIDATION
       query  → parseQuery: coerce per field, safeParse (empty query allowed)  → VALIDATION
       return handler(context)   (awaited, so async handlers work)
  └─ handleResponse: undefined → empty body, no Content-Type; string → text/plain; charset=utf-8; anything else → Response.json
  └─ catch: isLynError → handleError(error) ; else log + InternalServerError (500, no details leaked)

handleError → Response.json({ code, message, cause }, { status, headers: error.headers })
```

Default statuses: GET 200, POST 201, PUT 200, DELETE 204. Handlers override
via `set.status`; `set.headers` is kept. `Content-Type` is only defaulted
when the handler did not set it.

### CORS (`src/cors.ts`)

Disabled unless `config.cors` is set (checked by `assertValidCorsConfig` in
the constructor: `"*"` + `credentials` throws). `Lyn.handle` passes every
response, errors and 404/405 included, through `applyCors`: `Vary: Origin`
unless origin is `"*"`; if the request `Origin` is allowed, sets
Allow-Origin (+ Allow-Credentials); on a preflight (OPTIONS + Request-Method
+ 204) sets Allow-Methods from the `Allow` header, Allow-Headers (config or
echo of Request-Headers) and Max-Age (default 600); otherwise Expose-Headers.
Refused origins get no CORS header but the request is still processed.

### Typing

`Context<TBody, TParams, TQuery>` = `BodyContext & ParamsContext & QueryContext & { request, set }`.
Generics default to `undefined`, so `ctx.body` only exists when a body schema
is passed. Allowed schema shapes:

- body: any `ZodType`
- params: `z.object` of `ZodString | ZodNumber`
- query: `z.object` of `ZodString | ZodNumber | ZodBoolean` (optionally `.optional()`)

### Env (`src/env.ts`)

`new Lyn({ env: { key: { name: "ENV_NAME", type: "string" | "number" | "boolean" } } })`
is merged with the built-in `{ env: { name: "NODE_ENV", type: "string" } }`.
All variables are parsed from `Bun.env`; any failure logs the list and calls
`process.exit(1)`. Result is on `app.envConfig` (typed as `LynEnv`, which only
knows the `env` key — user keys are present at runtime but untyped).

## Known gaps and pitfalls

Treat these as current behaviour. Fix them only when asked, and update
`docs/` and this file when you do.

- `LynError` is not exported from `src/index.ts`; any thrown object with
  `isLynError: true` is treated as one (duck-typed).
- `ValidationError` does `JSON.parse(zodError.message)`; relies on Zod 4's
  message format.
- `DELETE` defaults to 204, so a returned body is dropped by the runtime.
- `pino` / `pino-pretty` are `devDependencies` but imported at runtime by
  `src/logger.ts` — must move to `dependencies` before publishing.
- `process.on("beforeExit")` is registered on every `listen()` call.
- Calling `listen()` twice silently starts a second server.

## Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`; keep zero `any`
  leaking into public types.
- ESM only, `verbatimModuleSyntax`: use `import type` for type-only imports.
- Chainable API: every route method returns `this`.
- New errors: subclass `LynError` in `src/error.ts` with an UPPER_SNAKE `code`
  and an HTTP status; never put internal details in 5xx responses.
- New HTTP method: add it to `LYN_SUPPORTED_METHODS` in `src/types.ts`, a
  default status in `src/utils.ts`, a builder method in `src/index.ts`, and
  extend `test/handle.test.ts` + `test/utils.test.ts`.
- Use Bun APIs over Node equivalents (`Bun.env`, `Bun.serve`, `Bun.file`, `bun:test`).
- `knip` must stay clean: no unused exports/files in `src/`.

## Comments

Good developers rarely write comments because they write explicit code.
Before writing a comment, try to make it unnecessary: rename, extract a
well-named function, restructure. Comments do not make up for bad code.

### ✅ Good reasons to comment

- **The why.** Explain a choice the code cannot express, and invite a refactor
  if someone finds better:
  ```ts
  // We had to write this because the browser treats everything as a box.
  // If you find a better way, don't hesitate to refactor it.
  ```
  ```ts
  compareTo(o) {
    if (o instanceof WikiPage) { ... }
    return 1; // we are greater because we are the right type
  }
  ```
- **Intent and importance.** Amplify something a reader could underestimate:
  `// this is really important because ...`
- **What humans don't read easily.** Regexes, non-obvious return contracts:
  `a.compareTo(b) // 0 means a === b`
- **Different backgrounds.** Readers may not share your context or opinions;
  a short note can bridge that.
- **Chapters.** Short headings that structure a long file:
  `// shaders`, `// textures`.
- **A guide while writing.** Scaffold the logic step by step, then **remove
  these comments as you code**. This includes TODOs, deleted once done.
  ```ts
  // get the request from the server
  // return the error if it failed
  // format the data
  ```
- **Known debt, OK to refactor.**
  `// not my best work, but we had to ship it by the deadline`
- **Teaching.** When the code is meant to train people or is read by
  external contributors.
- **External sources.** Link the Stack Overflow post / issue / spec the
  solution comes from, so a better answer can replace it later.
- **Warning of consequences.**
  `// Don't run unless you have some time to kill`,
  `// Not thread safe: create each instance independently`

### ❌ Bad comments

- **Saying what the code already says.**
  ```ts
  // if foo equals bar then
  if (foo === bar) {}
  // Default constructor
  constructor() {}
  ```
  No JSDoc on every method: only when needed to understand what it does.
- **Unmaintained comments** that no longer match the code after it changed.
- **Commented-out code.** Delete it; Git keeps the history.
  ```ts
  method1();
  // method2();
  method3();
  ```
- **Compensating for a bad name.** Names must say what a variable holds or a
  function does.
- **Explaining bad code** instead of improving it.
- **Misleading comments.** Misinformation is worse than no comment; keep
  comments clear, concise and true.
- **Journal comments.** No change logs in the code; that's what commit
  messages are for.

When you touch a file, apply these rules to the comments you meet: delete
the bad ones, and check that the good ones are still true.

## Testing

- Framework: `bun:test`. Files are `test/*.test.ts`.
- **Never start a server to test behaviour.** Build an app with
  `TEST_LYN_CONFIG` (hides the logo) and call it through
  `createTestClient(app)` from `testing/utilsTest.ts`, or `app.handle(new Request(...))`
  directly. No `listen()`, no `stop()`, no port.
- Only `test/handle.test.ts > listen` uses a real server, to check that
  `listen()` wires `handle()` correctly. Keep it that way.
- Router logic is unit-tested on `createRouter()` in `test/router.test.ts`.
- Tests share one process: restore any `Bun.env` value you change, and use
  `delete Bun.env.X` rather than assigning `undefined`.
- Every behaviour change ships with a test. Run `bun run test` and
  `bun run deadcode` before declaring work done.

## Git and commits

- **Never commit, push, amend or rebase without the maintainer's explicit
  approval for that specific action.** Prepare the changes, show them, and wait.
  Approval for one commit does not extend to the next.
- **No branches, local or remote.** All work is committed directly on `main`
  and the history stays linear. This overrides any default "branch first"
  behaviour of your tooling.
- **No AI attribution in commits**: no `Co-Authored-By: Claude …` (or any
  other agent) trailer, no "Generated with" line. The maintainer is the sole
  author. This overrides any default attribution of your tooling.
- Commit messages are in **English** and follow
  [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/):

  ```
  <type>(<optional scope>): <imperative summary, lowercase, no period, ≤ 72 chars>

  <body: what changed and why, wrapped at 72 columns>

  <footers: BREAKING CHANGE: ..., Refs: #123>
  ```

  | Type       | Use for                                      |
  | ---------- | -------------------------------------------- |
  | `feat`     | a new user-facing capability                 |
  | `fix`      | a bug fix                                    |
  | `docs`     | documentation only (`docs/`, README, CLAUDE.md) |
  | `test`     | adding or fixing tests only                  |
  | `refactor` | code change with no behaviour change         |
  | `perf`     | performance improvement                      |
  | `chore`    | tooling, dependencies, config                |
  | `ci`       | CI configuration                             |

  Useful scopes: `router`, `request`, `validation`, `env`, `logger`, `error`,
  `auth`, `types`.
- Any change to the public API or behaviour that can break users gets `!`
  after the type and a `BREAKING CHANGE:` footer, even before 1.0.
- One logical change per commit. Tests go in the same commit as the code they
  cover; docs describing a change go with it or in a dedicated `docs` commit.
- Before committing: `bun run test`, `bunx tsc --noEmit` and `bun run deadcode`
  must pass (or the remaining knip findings must be pre-existing and stated).

## Roadmap (from README)

Done: routes, lifecycle, body/params/query validation, logger, env vars.
Todo: example project, auth (better-auth + `pg`, see `src/lib/auth.ts` and
`docker-compose.yml`), documentation, publish, security checklist.
