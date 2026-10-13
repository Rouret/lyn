<h1 align="center">Lyn</h1>

<p align="center">
  <b>Type-safe APIs on Bun, without the setup.</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rouret/lyn"><img src="https://img.shields.io/npm/v/@rouret/lyn?color=cb3837&logo=npm" alt="npm version" /></a>
  <a href="https://github.com/Rouret/lyn/actions/workflows/ci.yml"><img src="https://github.com/Rouret/lyn/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/bun-%3E%3D1.3.6-f9f1e1?logo=bun" alt="Bun >= 1.3.6" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@rouret/lyn" alt="MIT license" /></a>
</p>

<p align="center">
  <a href="https://rouret.github.io/lyn/">Documentation</a> ·
  <a href="https://rouret.github.io/lyn/guide/getting-started">Getting started</a> ·
  <a href="examples/feedback-board">Example</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

Lyn is a small backend framework for [Bun](https://bun.sh). Chain your
routes, describe their inputs with [Zod](https://zod.dev), and get typed
handlers, request validation, consistent JSON errors and Postgres out of
the box.

It is made for proofs of concept, solo developers and agencies: a working,
safe API quickly, without assembling a stack first.

## Installation

```sh
bun add @rouret/lyn
```

Lyn runs on Bun only (`>= 1.3.6`) and needs TypeScript `>= 5.9`.

## Quick start

Describe your tables with the Drizzle helpers exported by `@rouret/lyn/db`:

```ts
// src/db/schema.ts
import { pgTable, text, timestamp, uuid } from "@rouret/lyn/db";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  displayName: text(),
  createdAt: timestamp().notNull().defaultNow(),
});
```

Pass the schema to Lyn, and every handler gets a typed `db`:

```ts
// src/index.ts
import { Lyn, z } from "@rouret/lyn";
import * as schema from "./db/schema";

await new Lyn({ database: { schema } })
  .get("/users", ({ db }) => db.query.users.findMany())
  .post(
    "/users",
    async ({ db, body }) => {
      const [user] = await db.insert(schema.users).values(body).returning();
      return user;
    },
    { body: z.object({ email: z.email(), displayName: z.string().optional() }) }
  )
  .listen(3000);
```

Create the table, then start the server:

```sh
echo "DATABASE_URL=postgres://postgres:changeme@localhost:5432/app" > .env
bun add -d drizzle-kit
bunx lyn db generate && bunx lyn db migrate
NODE_ENV=development bun run src/index.ts
```

```sh
curl -X POST localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"email":"ada@example.com"}'
# 201 {"id":"…","email":"ada@example.com","displayName":null,"createdAt":"…"}
```

A missing `DATABASE_URL`, an unreachable database or an invalid body are
caught before any query runs.

<img src="terminal.png" alt="Lyn running in a terminal" />

Next steps are in [Getting started](https://rouret.github.io/lyn/guide/getting-started).

## Features

- **Postgres built in**: pass a Drizzle schema, get a typed `db` in every handler.
- **Migrations**: `lyn db generate` and `lyn db migrate`, or `migrateOnStart`.
- **Typed handlers**: `body`, `params` and `query` are typed from your Zod schemas.
- **Validation**: invalid requests get a `400` before your handler runs.
- **One error format**: every error has the same JSON shape, and internal details never leak.
- **Checked configuration**: environment variables are validated and typed at startup.
- **CORS**: one option, preflight included.
- **Logs**: one line per request with a request id, JSON in production.
- **Tests without a server**: `app.handle(request)` runs a request in memory.

## Documentation

| Topic | Page |
| --- | --- |
| Introduction | [Why Lyn](https://rouret.github.io/lyn/guide/introduction) |
| Essentials | [Routing](https://rouret.github.io/lyn/essentials/routing) · [Handlers](https://rouret.github.io/lyn/essentials/handlers) · [Validation](https://rouret.github.io/lyn/essentials/validation) · [Errors](https://rouret.github.io/lyn/essentials/errors) |
| Configuration | [Overview](https://rouret.github.io/lyn/configuration/overview) · [Environment variables](https://rouret.github.io/lyn/configuration/environment-variables) · [CORS](https://rouret.github.io/lyn/configuration/cors) · [Logging](https://rouret.github.io/lyn/configuration/logging) |
| Database | [Postgres with Drizzle](https://rouret.github.io/lyn/integrations/database) |
| Guides | [Testing](https://rouret.github.io/lyn/guides/testing) |
| Reference | [API](https://rouret.github.io/lyn/reference/api) |

## Example

[`examples/feedback-board`](examples/feedback-board) is a complete
product-feedback API: Postgres, migrations, validation, transactions, CORS
and tests.

## Roadmap

- [x] Routing, validation, errors
- [x] Environment variables
- [x] Logging
- [x] CORS
- [x] Postgres with Drizzle
- [x] Documentation
- [x] CLI and migrations
- [x] Example project
- [x] Publish to npm
- [x] Perf
- [x] Benchmarking
- [x] Rate limit
- [ ] Configuration
- [ ] Custom Middleware
- [ ] Cloudflare Workers
- [ ] Testing
- [ ] Cron
- [ ] OpenAPI
- [ ] OpenTelemetry
- [ ] Cache
- [ ] Authentication
- [ ] Security checklist

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
for the workflow and the checks to run.

## Contact

[X @RouretLucas](https://x.com/RouretLucas)

## License

[MIT](LICENSE)
