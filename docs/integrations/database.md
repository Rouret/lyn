# Database

Lyn has Postgres built in, powered by [Drizzle ORM](https://orm.drizzle.team).
You don't install or configure Drizzle: pass your schema to `new Lyn()` and
use the ready, typed Drizzle instance in your handlers.

## Quick start

Describe your tables with the helpers exported by `lyn/db`:

```ts
// src/db/schema.ts
import { pgTable, text, timestamp, uuid } from "lyn/db";

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
import { Lyn, z } from "lyn";
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
import { eq, sql } from "lyn/db";

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

::: tip Import Drizzle from `lyn/db`
`lyn/db` re-exports `drizzle-orm` and `drizzle-orm/pg-core`: `pgTable`,
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

## Column names

Lyn configures Drizzle with `casing: "snake_case"`: camelCase keys in your
schema map to snake_case columns, which is the usual Postgres convention.
`displayName: text()` is stored as `display_name` without repeating the name.

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
- Migrations. Until the `lyn` CLI ships, create your tables with
  `drizzle-kit` (set `casing: "snake_case"` in its config) or plain SQL.
- Turning Postgres errors (unique violation…) into `409` or `400`. They
  are `500` for now.
- Connection pool options.
:::
