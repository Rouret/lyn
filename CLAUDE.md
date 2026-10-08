# CLAUDE.md

Guidance for AI coding agents (Claude Code, Cursor, Codex…) working on this
repository. `AGENTS.md` and `.cursor/rules/use-bun-instead-of-node-vite-npm-pnpm.mdc`
are symlinks to this file — edit this one only.

Documentation is split by audience:

- **Users of Lyn**: the VitePress site in [`docs/`](docs/guide/introduction.md),
  published to GitHub Pages on every push to `main`. Keep it in sync when
  you change public behaviour.
- **Maintainers**: [`CONTRIBUTING.md`](CONTRIBUTING.md) (workflow, checks,
  doc rules) and this file (architecture, conventions).

Never put repository internals (sandbox, `testing/utilsTest.ts`,
`NODE_ENV=lyn-test`, Docker, `src/` paths) in `docs/`. Follow the doc rules
in CONTRIBUTING.md before editing a page.

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
- Postgres through Drizzle, built in (`database: { schema }` → typed `ctx.db`),
- pino logging.

It targets POCs, solopreneurs and agencies: users should write as little
configuration as possible, and every public API must be precisely typed.
Auth (better-auth on top of the database) is planned but **not wired in
yet**. The package (`@rouret/lyn`, `version 0.0.1`) is **not published**
yet; `bun run build` writes it to `dist/`.

## Commands

Always use Bun. Never use node, npm, npx, pnpm, yarn, vite, jest or ts-node.

| Task                       | Command                                  |
| -------------------------- | ---------------------------------------- |
| Install deps               | `bun install`                            |
| Run the sandbox app (hot)  | `bun run dev` → `testing/local.ts` on :3000 (needs `NODE_ENV` set) |
| Run all tests              | `bun run test` (sets `NODE_ENV=lyn-test`) |
| Run all tests + Postgres   | `bun run test:db` (starts the `postgres-test` container, sets `TEST_DATABASE_URL`) |
| Run one test file          | `NODE_ENV=lyn-test bun test test/validation.test.ts` |
| Coverage                   | `NODE_ENV=lyn-test bun test --coverage`  |
| Dead-code check            | `bun run deadcode` (knip)                |
| Build to `dist/`           | `bun run build`                          |
| Docs site (hot)            | `bun run docs:dev`                       |
| Docs build (dead links)    | `bun run docs:build`                     |
| Type-check                 | `bunx tsc --noEmit`                      |
| Dev Postgres + pgAdmin     | `docker compose up -d postgres pgadmin`  |

Tests that need Postgres are wrapped in `describe.skipIf(!TEST_DATABASE_URL)`:
`bun run test` skips them, `bun run test:db` runs everything. The
`postgres-test` service uses port 54329 and a tmpfs, so it never touches the
dev database and starts empty. Run `bun run test:db` before committing any
change under `src/features/database.ts` or the request lifecycle.

Prefer `bun run test`: Lyn's internal logs are only silenced when
`NODE_ENV=lyn-test`. Tests must still pass with any `NODE_ENV`, including
when run from an IDE runner.

Requires Bun `>= 1.3.6` (`engines` in `package.json`).

## Layout

```
src/
  index.ts     Lyn class (route builder, handle, listen/stop/url, db), public exports: Lyn, z, logger, LynEnvError, LynDatabaseError
  config.ts    public `@rouret/lyn/config` entry: defineConfig + LynCliConfig (lyn.config.ts for the CLI)
  cli/
    index.ts     `lyn` bin (package.json "bin"): parses `lyn db <generate|migrate|studio>`, sets process.exitCode
    exit-code.ts EXIT_CODE (SUCCESS, FAILURE)
    db.ts        generate / studio → drizzle-kit (temp config, URL read from env), migrate → src/migrations.ts
  project-config.ts  loadDatabasePaths: optional lyn.config.ts (cwd), defaults src/db/schema.ts and drizzle/ (CLI + migrateOnStart)
  migrations.ts  assertMigrationsExist, applyMigrations (drizzle migrator on a reserved connection holding pg_advisory_lock)
  db.ts        public `@rouret/lyn/db` entry: re-exports drizzle-orm + drizzle-orm/pg-core (5 ambiguous types re-exported from pg-core)
  features/
    feature.ts   FeatureDefinition: config → { env?, create(env) → Feature } | undefined; Feature: { context?, onStart?, onStop?, onResponse?, mapError? } — internal, not a public plugin API
    cors.ts      CorsConfig, corsFeature (onResponse: actual + preflight headers)
    database.ts  DatabaseConfig, databaseFeature (DATABASE_URL env, Bun SQL, snake_case, ping / close, Postgres SQLSTATE → 409/400), DatabaseContext, DatabaseOf
  router.ts    Segment trie: path validation, matching, params extraction
  coerce.ts    coerceValue: string → number/boolean according to the zod field (unwraps .optional())
  query.ts     parseQuery: reads schema keys from URLSearchParams, coerceValue, safeParse
  params.ts    parseParams: coerceValue on router params, safeParse
  body.ts      readJsonBody: NO_BODY, JSON content type (415), JSON.parse (INVALID_JSON)
  request-log.ts  resolveRequestId (safe incoming X-Request-Id or UUID), logRequest (level by status),
               runWithRequestLog / currentRequestLog (AsyncLocalStorage set by handle(), used by query logs)
  shutdown.ts  one shared SIGINT/SIGTERM listener: stops every running app, then re-raises the signal
  request.ts   Route match → 404/405/OPTIONS, or lifecycle: validation → handler → response / error
  types.ts     All public & internal types (Context, Validation, RouteHandler, LynConfig…)
  env.ts       Env-var schema → parsed values, throws LynEnvError on invalid/missing
  error.ts     LynError + concrete errors (VALIDATION, NO_BODY, INVALID_JSON, UNSUPPORTED_MEDIA_TYPE, NOT_FOUND, METHOD_NOT_ALLOWED, CONFLICT, INTERNAL_SERVER_ERROR)
  logger.ts    one pino root `logger` (exported) + `internalLogger` child (msgPrefix "[Lyn] ");
               options from env: JSON in production, pino-pretty otherwise, LOG_LEVEL, silent in lyn-test
  http-status.ts  HTTP_STATUS (named status codes), isClientError, isServerError
  utils.ts     getDefaultStatusFromMethod
  lib/auth.ts  better-auth stub, not imported anywhere yet
test/          bun:test suites + constantsTest.ts (TEST_LYN_CONFIG) + fixtures/ (Drizzle schema, SQL)
testing/       local.ts (dev sandbox) and utilsTest.ts (createTestClient, built on app.handle)
scripts/build.ts  `bun run build`: Bun.build + tsc (tsconfig.build.json) → dist/
docs/          user documentation (VitePress site, one folder per sidebar category)
CONTRIBUTING.md  maintainer workflow and doc-writing rules
```

Imports inside `src/` use the `#lyn/*` → `./src/*.ts` subpath import from
the `package.json` `imports` map (not tsconfig `paths`, which consumers'
`tsc` ignores).
Tests import `test/...` and `testing/...` via `baseUrl: "."`.

## Architecture

### Route registration (`src/index.ts`)

- `get/post/put/delete(path, handler, validation?)` add a `Route` to the
  router and return `this`. `get` has no body generic.
- `handle(request)` is the single entry point: request id + child logger →
  parse pathname → `router.match` → `handleRouteMatch({ …, log, appContext })`
  → each feature's `onResponse` → `X-Request-Id` header → one `logRequest`
  line. Tests and `listen()` both
  use it. Only unexpected errors are logged inside the lifecycle (with the
  same child logger); LynErrors are covered by the request line.
- `listen(port = 0)` is async: status `stopped → starting`, runs every
  feature's `onStart` (database ping), then calls `Bun.serve({ fetch: req => this.handle(req), idleTimeout: 30 })`
  (Bun's native `routes` option is deliberately **not** used, so that
  `handle()` and the server cannot diverge), prints the ASCII logo unless
  `config.start.hideLynLogo`, sets `baseUrl = http://127.0.0.1:<port>`.
  Port `0` = random free port.
- `url` getter throws if `listen()` has not been called.
- `listen()` rejects while `starting` or `running`; a failed `onStart` resets
  the status to `stopped`. `stop()` stops the server, runs `onStop` in reverse
  feature order (closes the pool) and unregisters the app from
  `src/shutdown.ts`. `listen()` registers it: one shared `SIGINT`/`SIGTERM`
  listener exists while at least one app runs; on a signal it detaches,
  `stop()`s every app (errors logged), then re-raises the signal so the
  process exits as usual, unless the user has their own listener for it.
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

### Features (`src/features/`)

Built-in features are internal modules listed in `BUILT_IN_FEATURES`
(`src/index.ts`). Each exports a `FeatureDefinition`: `(config) → undefined`
when disabled, else `{ env?, create }`. The constructor collects every
feature's `env` and parses it with the user's in one `parseEnvs` pass (one
`LynEnvError`, kept off `app.env`), then calls `create({ app, own })` with
the typed `app.env` and the feature's own variables. `Lyn` merges
their `context` into every handler context, runs `onStart` in order on
`listen()`, `onStop` in reverse order on `stop()`, and pipes every response
through `onResponse`. When a handler throws something that is not a
LynError, the first feature whose `mapError` returns a LynError answers
(logged at warn with the original error); otherwise 500. Adding a feature = a new file + one entry in
`BUILT_IN_FEATURES`; never add `if (this.config.x)` branches to `Lyn`
methods.
Users only see `new Lyn({ … })` options.

### Database (`src/features/database.ts`)

- `new Lyn({ database: { schema, url? } })`. Without `url`, `DATABASE_URL` is
  parsed by `parseEnvs` in the same pass as the user env (one `LynEnvError`
  for all problems) but kept off `app.env`. `url` may be a function of the
  typed `app.env`; a blank result throws `LynDatabaseError`.
- `createDatabase` = `drizzle({ client: new SQL(url), schema, casing: "snake_case" })`.
  Bun SQL connects lazily, so creation is sync and `app.db` exists right
  after the constructor; `handle()` works without `listen()`.
- Feature: `context: { db }`, `onStart` = `select 1` →
  `LynDatabaseError("Cannot connect to the database: <cause>")` (cause from
  `DrizzleQueryError.cause`, never the URL or the query); `onStop` closes the
  pool and marks it closed, so a later `listen()` explains it can't reconnect.
- `mapError`: finds `SQL.PostgresError` (thrown directly or as Drizzle's
  `cause`) and maps its `errno` (SQLSTATE): 23505 / 23503 → `ConflictError`,
  23502 / 22P02 → `InvalidValueError` (code `VALIDATION`). Fixed messages
  only: never the table, constraint, SQL or values.
- `db` is the raw `drizzle()` return type (`BunSQLDatabase<TSchema> & { $client: SQL }`).
  Never wrap it. Drizzle errors' `message` contains the SQL and parameters:
  never forward it to clients.
- Drizzle is imported statically (~10 ms, measured): no lazy loading.
- `pool` → `new SQL(url, { ...DEFAULT_POOL, ...pool })`; Lyn's defaults
  (max 10, idleTimeout 30 s, connectionTimeout 10 s) are explicit so the
  docs don't depend on Bun's.
- `logQueries` → Drizzle `logger` writing `{ query, paramCount }` at info
  on `currentRequestLog()` (request id) or `internalLogger` outside a
  request. Never log parameter values.
- `migrateOnStart` → `onStart`, after the ping: `loadDatabasePaths(process.cwd())`
  then `applyMigrations` (advisory lock, so concurrent instances migrate
  once); failures → `LynDatabaseError("migrateOnStart failed: …")`.
- Bun SQL JSON-encodes strings bound to json/jsonb params, so Drizzle's
  `JSON.stringify` double-encoded them. `createDatabase` patches
  `PgJson`/`PgJsonb.prototype.mapToDriverValue` to pass the value as-is.
  `test/database-driver.test.ts` (load + JSON) guards it: re-run it on
  every Bun or Drizzle upgrade, and drop the patch once upstream is fixed.

### CORS (`src/features/cors.ts`)

Disabled unless `config.cors` is set (checked by `assertValidCorsConfig` in
`createCorsFeature`: `"*"` + `credentials` throws). `Lyn.handle` passes every
response, errors and 404/405 included, through `applyCors`: `Vary: Origin`
unless origin is `"*"`; if the request `Origin` is allowed, sets
Allow-Origin (+ Allow-Credentials); on a preflight (OPTIONS + Request-Method
+ 204) sets Allow-Methods from the `Allow` header, Allow-Headers (config or
echo of Request-Headers) and Max-Age (default 600); otherwise Expose-Headers.
Refused origins get no CORS header but the request is still processed.

### Typing

`Context<TBody, TParams, TQuery, TAppContext>` = `BodyContext & ParamsContext & QueryContext & TAppContext & { request, set }`.
Generics default to `undefined`, so `ctx.body` only exists when a body schema
is passed. `Lyn<TEnvConfig, TSchema>`: `TSchema` is inferred from
`database.schema` (default `undefined`); route methods pass
`DatabaseContext<TSchema>` as `TAppContext`, so `ctx.db` exists only with a
database, and `app.db` is `DatabaseOf<TSchema>` — a branded type whose only
key is the "No database configured…" message otherwise. Conditionals use
`[TSchema] extends [DatabaseSchema]` to avoid distribution. Every typing
change ships with `@ts-expect-error` / `satisfies` cases in
`test/types.test.ts`. Allowed schema shapes:

- body: any `ZodType`
- params: `z.object` of `ZodString | ZodNumber`
- query: `z.object` of `ZodString | ZodNumber | ZodBoolean` (optionally `.optional()`)

### Build (`scripts/build.ts`)

- `Bun.build` (target bun) bundles the four entries (`index`, `db`,
  `config`, `cli/index`) to `dist/`. Every `dependencies` and
  `peerDependencies` package (and its subpaths) stays external: Lyn and the
  user must share one `drizzle-orm` instance for the JSON patch, and pino
  loads `pino-pretty` by name. `src/index.ts` imports only `version` from
  `package.json`, so the rest isn't inlined.
- `tsc -p tsconfig.build.json` emits the `.d.ts`, then the script rewrites
  their `#lyn/*` specifiers to relative `./x.js` paths: the `imports` map
  points at `src/`, which isn't shipped.

### CLI (`src/cli/`)

- `lyn db generate | studio` spawn drizzle-kit's `bin.cjs` with
  `bun --bun`, from the project's `node_modules` (searched upwards, never
  auto-installed). drizzle-kit is an **optional peer dependency**: missing
  → error telling to `bun add -d drizzle-kit`. Lyn writes a temporary
  `drizzle.config.ts` (dialect, absolute schema/out paths,
  `casing: "snake_case"`, `process.env.DATABASE_URL`) and deletes it after;
  the URL is never written to disk. Extra args are passed through.
- `lyn db migrate` uses `drizzle-orm/bun-sql/migrator` directly, so
  production installs don't need drizzle-kit.
- `DATABASE_URL` is read through `parseEnvs` (same `LynEnvError` format);
  Bun loads `.env` from the cwd.
- Tests (`test/cli.test.ts`) run the CLI as a subprocess in temp projects
  whose `node_modules` is a symlink to the repo's.
- `lyn db studio` uses the `pg` driver (drizzle-kit picks it): keep `pg`
  until Studio can use another driver.

### Env (`src/env.ts`)

`new Lyn({ env: { key: { name: "ENV_NAME", type: "string" | "number" | "boolean" } } })`
is merged with the built-in `{ nodeEnv: { name: "NODE_ENV", type: "string" } }`.
All variables are parsed from `Bun.env`; blank values count as missing; any
failure throws one `LynEnvError` listing `NAME: missing` / `NAME: expected …`
(never the value — it may be a secret). The library never calls `process.exit`.
`Lyn<TEnvConfig>` is generic over the config, so the result on `app.env` is
typed: `LynEnv<TEnvConfig>` maps `type` to `string | number | boolean` and
includes the built-in `nodeEnv` key.

## Known gaps and pitfalls

Treat these as current behaviour. Fix them only when asked, and update
`docs/` and this file when you do.

- `LynError` is not exported from `src/index.ts`; any thrown object with
  `isLynError: true` is treated as one (duck-typed).
- `ValidationError` does `JSON.parse(zodError.message)`; relies on Zod 4's
  message format.
- `DELETE` defaults to 204, so a returned body is dropped by the runtime.
- An app with a database can't `listen()` again after `stop()` (the pool is
  closed); tests and scripts create a new app instead.

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
- No magic numbers or codes in `src/`: name them. A constant shared by
  several modules lives in a module named after its domain
  (`src/http-status.ts` → `HTTP_STATUS`, `src/cli/exit-code.ts`), never a
  catch-all `constants.ts`; a constant used by one module is an UPPER_SNAKE
  `const` at the top of that module (`POSTGRES_ERROR_CODE`,
  `SERVER_IDLE_TIMEOUT_SECONDS`). Group related values in an `as const`
  object. Units go in the name (`_SECONDS`, `_MS`). Tests keep literal
  values: there the number is the specification.
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

Done: routes, lifecycle, body/params/query validation, logger, env vars,
CORS, Postgres with Drizzle, documentation, CLI and migrations.
Todo: auth (better-auth, see `src/lib/auth.ts`), example
project, security checklist, publish.
