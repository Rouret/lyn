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

Create the tables with [migrations](migrations.md).

::: warning Don't send rows as they are
The examples on this page return rows directly to stay short. In a real
app, a row can hold password hashes or internal fields: map it to a DTO
before returning it. See
[Never return a database row](../guides/best-practices.md#never-return-a-database-row).
:::

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
  { params: z.object({ id: z.string().uuid() }) }
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

## Connection

### Connection string

By default Lyn reads `DATABASE_URL`. Pass `url` to use something else — a
string, or a function receiving the parsed, typed [`app.env`](../configuration/environment-variables.md#reading-the-values):

```ts
new Lyn({
  env: { postgresUrl: { name: "POSTGRES_URL", type: "string" } },
  database: { schema, url: (env) => env.postgresUrl },
});
```

When `url` is given, `DATABASE_URL` is not required.

### Connection pool

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
Postgres server. See [Performance](../guides/performance.md#size-the-pool)
to tune it.

### Statement timeout

Postgres cancels any query that runs longer than the request timeout
(`server.requestTimeoutMs`, 30 seconds by default). A slow query can't
keep a connection busy after its client got a `408`, so a burst of slow
requests can't fill the pool. Change it with `statementTimeoutMs`:

```ts
new Lyn({
  database: {
    schema,
    statementTimeoutMs: 5000, // milliseconds, 0 disables it
  },
});
```

It applies to `app.db` too, so raise it, or set `0`, for long scripts.
Migrations are never cancelled.

### Startup and shutdown

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

To apply pending migrations from `listen()`, see
[Migrating on start](migrations.md#migrating-on-start).

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

Constraints are your last line of defence against bad data: see
[Let Postgres guard your data](../guides/best-practices.md#let-postgres-guard-your-data).

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
