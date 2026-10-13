# Project structure

A one-file app is fine for a prototype. As soon as it grows, split it like
this:

```txt
my-api/
├── drizzle/              migrations, written by `lyn db generate`
├── src/
│   ├── app.ts            creates the app: config + routes
│   ├── index.ts          starts it: `listen()`
│   ├── errors.ts         your own error helpers
│   ├── db/
│   │   └── schema.ts     your tables
│   ├── dto/
│   │   └── post.ts       what the API returns, built from the rows
│   └── routes/
│       ├── boards.ts
│       └── posts.ts
├── test/
│   └── posts.test.ts
├── .env
└── package.json
```

`src/db/schema.ts` and `drizzle/` are where the [`lyn db`](../integrations/migrations.md)
commands look by default.

## Create the app in one file, start it in another

`app.ts` builds the app and exports a function. Tests import it without
starting a server; `index.ts` is the only file that calls `listen()`.

```ts
// src/app.ts
import { Lyn } from "@rouret/lyn";
import * as schema from "./db/schema";
import { registerBoardRoutes } from "./routes/boards";
import { registerPostRoutes } from "./routes/posts";

const envConfig = {
  port: { name: "PORT", type: "number" },
} as const;

export type App = Lyn<typeof envConfig, typeof schema>;
export type Db = App["db"];

export const createApp = ({ databaseUrl }: { databaseUrl?: string } = {}) => {
  const app: App = new Lyn({
    env: envConfig,
    database: { schema, url: databaseUrl },
  });
  return registerPostRoutes(registerBoardRoutes(app));
};
```

```ts
// src/index.ts
import { createApp } from "./app";

const app = createApp();
await app.listen(app.env.port);
```

- `App` is the type of your app, with its environment variables and its
  database. Use it to type the route files.
- `Db` is the type of `ctx.db`, for helper functions that take it.
- `databaseUrl` lets tests point the app at a
  [test database](../guides/testing.md#with-a-database).

## One file per resource

Each file exports a function that takes the app, adds its routes and
returns it. Every route method returns the app, so the types follow:

```ts
// src/routes/posts.ts
import { z } from "@rouret/lyn";
import { eq } from "@rouret/lyn/db";
import type { App, Db } from "../app";
import { posts } from "../db/schema";
import { notFound } from "../errors";

const postParams = z.object({ id: z.string().uuid() });

const findPostOrThrow = async (db: Db, id: string) => {
  const post = await db.query.posts.findFirst({ where: eq(posts.id, id) });
  if (!post) throw notFound("Post not found");
  return post;
};

export const registerPostRoutes = (app: App) =>
  app
    .get("/posts/:id", ({ db, params }) => findPostOrThrow(db, params.id), {
      params: postParams,
    })
    .delete(
      "/posts/:id",
      async ({ db, params }) => {
        await findPostOrThrow(db, params.id);
        await db.delete(posts).where(eq(posts.id, params.id));
      },
      { params: postParams }
    );
```

Keep the schemas a route file shares, such as `postParams`, at the top of
that file.

## What you return in one place

`src/dto/` holds the mappers that turn a row into what the client
receives. A new column then stays private until you add it there:

```ts
// src/dto/post.ts
import type { posts } from "../db/schema";

export const toPostDto = (post: typeof posts.$inferSelect) => ({
  id: post.id,
  title: post.title,
  votes: post.voteCount,
});
```

See [Never return a database row](../guides/best-practices.md#never-return-a-database-row).

## Your errors in one place

```ts
// src/errors.ts
const httpError = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { isLynError: true, status, code });

export const notFound = (message: string) => httpError(404, "NOT_FOUND", message);
export const forbidden = (message: string) => httpError(403, "FORBIDDEN", message);
```

See [Sending your own errors](../essentials/errors.md#sending-your-own-errors).

## Scripts

```json
{
  "scripts": {
    "dev": "NODE_ENV=development bun --hot run src/index.ts",
    "start": "NODE_ENV=production bun run src/index.ts",
    "test": "NODE_ENV=test LOG_LEVEL=silent bun test",
    "typecheck": "tsc --noEmit",
    "db:generate": "lyn db generate",
    "db:migrate": "lyn db migrate"
  }
}
```

There is no build script: Bun runs TypeScript as is, in development and
in [production](../guides/production.md).
