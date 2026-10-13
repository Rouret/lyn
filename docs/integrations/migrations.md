# Migrations

A migration is a SQL file that changes your tables. The `lyn db` commands
write them from your schema and apply them to the database.

## Setup

Generating migrations uses
[drizzle-kit](https://orm.drizzle.team/docs/kit-overview), installed once
as a dev dependency:

```bash
bun add -d drizzle-kit
```

Lyn runs the `drizzle-kit` installed in this project's `node_modules`. A
copy in a parent directory is ignored. Applying migrations doesn't need
it, so production installs stay light.

## The workflow

**1. Change your schema**

```ts
// src/db/schema.ts
export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  displayName: text(), // new column
});
```

**2. Generate the migration**

```bash
bunx lyn db generate --name add_display_name
```

Lyn compares `src/db/schema.ts` with the previous migrations and writes a
new SQL file to `drizzle/`. Read it, then commit the whole folder.

**3. Apply it**

```bash
bunx lyn db migrate
```

`migrate` applies the files not applied yet, in order, so you can run it
on every deploy. See [Production](../guides/production.md#migrations).

## Commands

| Command | What it does | Needs drizzle-kit |
| --- | --- | --- |
| `lyn db generate` | Writes the SQL for your schema changes to `drizzle/` | yes |
| `lyn db migrate` | Applies the pending migrations to `DATABASE_URL` | no |
| `lyn db studio` | Opens [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview) on `DATABASE_URL` | yes |

`migrate` and `studio` read `DATABASE_URL`. Bun loads it from your `.env`
files.

Extra flags go to drizzle-kit, for example
`bunx lyn db studio --port 5000`.

## Other paths

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
[`snake_case` column names](database.md#column-names) to drizzle-kit for you.

## Migrating on start

With `migrateOnStart`, `listen()` also applies the pending
migrations before serving:

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
