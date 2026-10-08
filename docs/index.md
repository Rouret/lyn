---
layout: home

hero:
  name: Lyn
  text: API, database and auth. One install.
  tagline: A Bun backend that comes already wired. No ORM to set up, no pool to create, no middleware to glue. Install it and write your routes.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: What is Lyn?
      link: /guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/Rouret/lyn
---

<div class="home-sections">

## From zero to a database-backed API

**1. Install**

```bash
bun add lyn
```

**2. Point it at Postgres**

```bash
# .env
DATABASE_URL=postgres://localhost:5432/app
```

**3. Write your routes**

```ts
import { Lyn, z } from "lyn";
import * as schema from "./db/schema";

await new Lyn({ database: { schema } })
  .get("/users", ({ db }) => db.query.users.findMany())
  .post(
    "/users",
    async ({ db, body }) => {
      const [user] = await db.insert(schema.users).values(body).returning();
      return user;
    },
    { body: z.object({ email: z.email(), name: z.string() }) }
  )
  .listen(3000);
```

That's the whole app. The connection is checked at startup, `db` is typed
from your tables, invalid bodies get a `400`.

::: tip Not on npm yet
Lyn is at `0.0.1`. Until the first release, [use it from a clone](/guide/getting-started#installation).
:::

## What you don't have to do

| Usually | With Lyn |
| --- | --- |
| Install an ORM, a driver, and create a connection pool | Pass your schema |
| Make `db` available in every handler | It's in the context |
| Check the database is reachable before serving | Done by `listen()` |
| Validate env variables, and find a missing one in production | Checked and typed at startup |
| Write a validation middleware and type the request by hand | Zod schemas, types inferred |
| Write an error handler, and avoid leaking stack traces | One JSON error format, nothing leaks |
| Set up request logging and request ids | One line per request, built in |
| Pick, install and wire an auth library | Built in, coming next |

## Authentication <Badge type="warning" text="coming next" />

Sign-up, sign-in and sessions, stored in the same Postgres database, with
nothing to install or configure. It is the next feature on the
[roadmap](https://github.com/Rouret/lyn#roadmap).

## Ready when you are

- [Getting started](/guide/getting-started): your first server in five minutes.
- [Database](/integrations/database): everything `db` can do.
- [Testing](/guides/testing): test your routes without a server.

</div>

<style>
.home-sections {
  max-width: 760px;
  margin: 0 auto;
}
.home-sections h2 {
  border-top: none;
  margin-top: 64px;
}
</style>
