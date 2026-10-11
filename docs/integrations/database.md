# Database

Lyn has Postgres built in, powered by [Drizzle ORM](https://orm.drizzle.team).
You don't install or configure Drizzle: pass your schema to `new Lyn()` and
use the ready, typed Drizzle instance in your handlers.

## Quick start

Describe your tables with the helpers exported by `@rouret/lyn/db`:

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

Pass the schema to Lyn:

```ts
// src/index.ts
import { Lyn, z } from "@rouret/lyn";
import * as schema from "./db/schema";

const app = new Lyn({ database: { schema } })
  .get("/users", ({ db }) => db.query.users.findMany())
  .post(
    "/users",
    async ({ db, body }) => {
      const [user] = await db.insert(schema.users).values(body).returning();
      return user;
    },
    { body: z.object({ email: z.email(), displayName: z.string().optional() }) }
  );

await app.listen(3000);
```

Set the connection string:

```bash
# .env
DATABASE_URL=postgres://postgres:changeme@localhost:5432/app
```

That's all. Lyn:

- reads `DATABASE_URL` with the other [environment variables](../configuration/environment-variables.md),
  and refuses to start if it is missing;
- creates the Drizzle instance from your schema;
- checks the connection before `listen()` starts serving;
- closes the connection on `stop()`, `SIGINT` and `SIGTERM`.

## `db` is plain Drizzle

`ctx.db` in handlers and `app.db` are the instance Drizzle's `drizzle()`
returns, typed from your schema. Everything in the
[Drizzle documentation](https://orm.drizzle.team/docs/overview) applies as is:
relational queries, the query builder, transactions, raw SQL.

```ts
import { eq, sql } from "@rouret/lyn/db";

.get(
  "/users/:id",
  ({ db, params }) =>
    db.query.users.findFirst({ where: eq(schema.users.id, params.id) }),
  { params: z.object({ id: z.uuid() }) }
)

.post("/transfers", ({ db, body }) =>
  db.transaction(async (tx) => {
    await tx
      .update(schema.accounts)
      .set({ balance: sql`${schema.accounts.balance} - ${body.amount}` })
      .where(eq(schema.accounts.id, body.from));
    await tx
      .update(schema.accounts)
      .set({ balance: sql`${schema.accounts.balance} + ${body.amount}` })
      .where(eq(schema.accounts.id, body.to));
  }),
  { body: transferSchema }
)
```

::: tip Import Drizzle from `@rouret/lyn/db`
`@rouret/lyn/db` re-exports `drizzle-orm` and `drizzle-orm/pg-core`: `pgTable`,
column types, `eq`, `and`, `sql`… Don't install `drizzle-orm` yourself, so
your schema always uses the same Drizzle version as Lyn.
:::

Everything is typed from the schema:

```ts
const users = await db.query.users.findMany();
users[0]?.email;    // string
users[0]?.password; // type error: no such column
db.query.posts;     // type error: no such table
```

Routes of an app without `database` have no `db` in their context, and
using `app.db` is a type error.

::: tip JSON columns
`json()` and `jsonb()` columns take and return plain objects. In raw
`sql`, pass the object itself, not `JSON.stringify(object)`, which would
be stored as a JSON string.
:::

## Column names

Lyn configures Drizzle with `casing: "snake_case"`: camelCase keys in your
schema map to snake_case columns, which is the usual Postgres convention.
`displayName: text()` is stored as `display_name` without repeating the name.

## Migrations

The `lyn db` commands create and apply your migrations. Generating them
uses [drizzle-kit](https://orm.drizzle.team/docs/kit-overview), installed
once as a dev dependency:

```bash
bun add -d drizzle-kit
```

Lyn runs the `drizzle-kit` installed in this project's `node_modules`.
A copy in a parent directory is ignored.

```bash
bunx lyn db generate   # write the SQL for your schema changes to drizzle/
bunx lyn db migrate    # apply the pending migrations to DATABASE_URL
bunx lyn db studio     # browse your data in Drizzle Studio
```

`generate` compares `src/db/schema.ts` with the previous migrations and
writes a new SQL file to `drizzle/`. Commit that folder. `migrate` applies
the files not applied yet, so you can run it on every deploy. It doesn't
need drizzle-kit, so production installs stay light.

`migrate` and `studio` read `DATABASE_URL`. Bun loads it from your `.env`
files.

Extra flags go to drizzle-kit, for example
`bunx lyn db generate --name add_users` or `bunx lyn db studio --port 5000`.

### Other paths

If your schema or migrations live elsewhere, add a `lyn.config.ts` at the
root of your project:

```ts
// lyn.config.ts
import { defineConfig } from "@rouret/lyn/config";

export default defineConfig({
  database: {
    schema: "./src/database/schema.ts",
    migrations: "./migrations",
  },
});
```

Paths are relative to the project root. You don't need a
`drizzle.config.ts`: Lyn passes the dialect, the paths and the
[`snake_case` column names](#column-names) to drizzle-kit for you.

## Connection string

By default Lyn reads `DATABASE_URL`. Pass `url` to use something else — a
string, or a function receiving the parsed, typed [`app.env`](../configuration/environment-variables.md#reading-the-values):

```ts
new Lyn({
  env: { postgresUrl: { name: "POSTGRES_URL", type: "string" } },
  database: { schema, url: (env) => env.postgresUrl },
});
```

When `url` is given, `DATABASE_URL` is not required.

## Connection pool

Lyn keeps a pool of connections. Change its limits with `pool`:

```ts
new Lyn({
  database: {
    schema,
    pool: {
      max: 20,               // connections, default 10
      idleTimeout: 60,       // seconds before closing an idle connection, default 30
      connectionTimeout: 5,  // seconds to wait when connecting, default 10
      maxLifetime: 3600,     // seconds before replacing a connection, default 0 (never)
    },
  },
});
```

Keep `max` × your number of instances below the `max_connections` of your
Postgres server.

## Query logs

Set `logQueries` to log every SQL query at `info` level, with the
[request id](../configuration/logging.md#request-ids) of the request that
ran it:

```ts
new Lyn({ database: { schema, logQueries: true } });
```

```json
{"level":30,"requestId":"43297dd3-…","query":"select \"id\", \"email\" from \"users\" where \"users\".\"id\" = $1","paramCount":1,"msg":"[Lyn] SQL query"}
```

The values of the parameters are never logged, only their count: they
may hold personal data or secrets. Off by default. The same rule applies
when a query fails: the error log has the stack frames and the Postgres
code, not the query text or the bound values.

## Startup and shutdown

```ts
await app.listen(3000);
```

`listen()` runs `select 1` before serving. If the database is unreachable it
rejects with a `LynDatabaseError` and the server doesn't start:

```
LynDatabaseError: Cannot connect to the database: Failed to connect
```

The connection string is never included in the error.

`stop()` closes the connection pool. A stopped app can't reconnect:
`listen()` then rejects with `The database connection was closed by stop():
create a new Lyn instance to connect again`.

The connection is opened on the first query, so `app.handle()` works
without `listen()`, which is handy in tests.

### Migrating on start

With `migrateOnStart`, `listen()` also applies the pending
[migrations](#migrations) before serving:

```ts
new Lyn({ database: { schema, migrateOnStart: true } });
```

It reads the migrations folder from `drizzle/`, or from your
[`lyn.config.ts`](#other-paths), relative to the directory you start the
app from. If a migration fails, `listen()` rejects with a
`LynDatabaseError` and the server doesn't start. Instances starting
together wait for each other, so each migration runs once.

Handy for prototypes and single-instance apps. With several instances,
prefer running `lyn db migrate` once in your deploy pipeline. Off by
default.

## Database errors

When a query in a handler fails, Lyn turns the common Postgres errors into
client errors:

| Postgres error | Response |
| --- | --- |
| Unique violation (`23505`) | `409 CONFLICT`: `A record with this value already exists` |
| Foreign key violation (`23503`) | `409 CONFLICT`: `This record conflicts with a related record` |
| Not-null violation (`23502`) | `400 VALIDATION`: `A required value is missing` |
| Invalid value, such as a malformed uuid (`22P02`) | `400 VALIDATION`: `A value has an invalid format` |
| Anything else | `500 INTERNAL_SERVER_ERROR` |

```json
{ "code": "CONFLICT", "message": "A record with this value already exists" }
```

The table, constraint, SQL and values are never sent to the client. They
are logged on the server with the request id.

For a more precise answer, catch the error in your handler and throw
[your own error](../essentials/errors.md#sending-your-own-errors). The
Postgres code is on `error.cause.errno`:

```ts
try {
  return await db.insert(votes).values(body).returning();
} catch (error) {
  const cause = (error as Error).cause as { errno?: string } | undefined;
  if (cause?.errno === "23505")
    throw alreadyVoted("You already voted for this post");
  throw error;
}
```

## Scripts and seeds

`app.db` is available as soon as the app is created:

```ts
// scripts/seed.ts
import { app } from "../src/app";
import { users } from "../src/db/schema";

await app.db.insert(users).values([{ email: "ada@example.com" }]);
await app.stop();
```

## Tests

Point the app at a test database with `url`, and call it through
`app.handle()`. See [Testing](../guides/testing.md#with-a-database).

::: info Not supported yet
- Databases other than Postgres. Lyn uses Bun's built-in Postgres driver.
- Changing the column [casing](#column-names).
:::
