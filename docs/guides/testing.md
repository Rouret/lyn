# Testing

You don't need a running server to test a Lyn app. `app.handle(request)`
takes a standard `Request` and returns the `Response` the server would
send: `listen()` goes through exactly the same code. Tests are fast, use no
port, and there is nothing to stop.

## A first test

```ts
// users.test.ts
import { expect, it } from "bun:test";
import { Lyn, z } from "lyn";

const app = new Lyn().post(
  "/users",
  ({ body }) => ({ name: body.name }),
  { body: z.object({ name: z.string() }) }
);

it("creates a user", async () => {
  const response = await app.handle(
    new Request("http://localhost/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    })
  );

  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ name: "Ada" });
});
```

```bash
NODE_ENV=test LOG_LEVEL=silent bun test
```

`LOG_LEVEL=silent` keeps the test output clean. The host in the URL is
ignored: only the method, path, query string, headers and body matter.

## A small helper

Building `Request` objects gets repetitive. A ten-line helper is enough:

```ts
// test/client.ts
import type { Lyn } from "lyn";

export const createClient = (app: Pick<Lyn, "handle">) => {
  const send = (method: string, path: string, body?: unknown) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method,
        ...(body !== undefined && {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        }),
      })
    );

  return {
    get: (path: string) => send("GET", path),
    post: (path: string, body?: unknown) => send("POST", path, body),
    put: (path: string, body?: unknown) => send("PUT", path, body),
    delete: (path: string) => send("DELETE", path),
  };
};
```

```ts
const client = createClient(app);

const response = await client.post("/users", { nope: true });
expect(response.status).toBe(400);
```

## With a database

Point the app at a test database with `url`, and close it after the tests:

```ts
import { afterAll, expect, it } from "bun:test";
import * as schema from "../src/db/schema";

const app = new Lyn({
  env: { testDatabaseUrl: { name: "TEST_DATABASE_URL", type: "string" } },
  database: { schema, url: (env) => env.testDatabaseUrl },
}).get("/users", ({ db }) => db.query.users.findMany());

afterAll(() => app.stop());

it("lists users", async () => {
  const response = await app.handle(new Request("http://localhost/users"));
  expect(response.status).toBe(200);
});
```

No `listen()` is needed: the connection opens on the first query.

## Environment variables

Variables are read in `new Lyn()`. Set them on `Bun.env` before creating
the app, and restore them afterwards, since all test files share the same
process.

::: warning Removing a variable
Use `delete Bun.env.NAME`. Assigning `undefined` stores the string
`"undefined"`.
:::

An invalid configuration throws, so you can test it without mocks:

```ts
import { Lyn, LynEnvError } from "lyn";

delete Bun.env.API_KEY;
expect(() => new Lyn({ env: { apiKey: { name: "API_KEY", type: "string" } } }))
  .toThrow(LynEnvError);
```

## Over real HTTP

To test the real server, call `listen()` without a port to get a free one:

```ts
const server = await app.listen();
try {
  const response = await fetch(`${server.url}/users`);
  expect(response.status).toBe(200);
} finally {
  await server.stop();
}
```

You rarely need it: `handle()` covers the same behaviour.
