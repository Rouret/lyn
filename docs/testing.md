# Testing

You don't need to start a server to test a Lyn app. `app.handle(request)`
takes a standard `Request` and returns the `Response` the server would send —
`listen()` goes through exactly the same code. Tests are fast, need no port,
and nothing has to be stopped.

## With `app.handle`

```ts
// users.test.ts
import { expect, it } from "bun:test";
import { Lyn, z } from "lyn";

const app = new Lyn({ start: { hideLynLogo: true } }).post(
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

it("rejects an invalid body", async () => {
  const response = await app.handle(
    new Request("http://localhost/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nope: true }),
    })
  );

  expect(response.status).toBe(400);
  expect(((await response.json()) as { code: string }).code).toBe("VALIDATION");
});
```

```bash
NODE_ENV=lyn-test bun test
```

`NODE_ENV=lyn-test` silences Lyn's internal logs. Any value works otherwise —
`NODE_ENV` just has to be set.

The host part of the URL is ignored; only the path, query string, method and
body matter. You can build one app per test or share one across a file.

## Test client helper

The repository contains a small helper in `testing/utilsTest.ts` that wraps
`handle`, JSON-encodes bodies and sets `Content-Type: application/json`:

```ts
import { createTestClient } from "./testing/utilsTest";

const client = createTestClient(app);
await client.get("/users?page=2");
await client.post("/users", { name: "Ada" });
await client.put("/users/1", { name: "Grace" });
await client.delete("/users/1");
```

## End-to-end over HTTP

To test the real server (ports, network, Bun options), call `listen()` with
no port to get a free one, and stop it afterwards:

```ts
const server = app.listen();
try {
  const response = await fetch(`${server.url}/users`);
  expect(response.status).toBe(200);
} finally {
  await server.stop();
}
```

## Testing env-dependent code

Environment variables are read in the constructor. Set them on `Bun.env`
before calling `new Lyn()`, and remove them with `delete Bun.env.NAME`
(assigning `undefined` stores the string `"undefined"`). Restore them after
the test: all test files share the same process.

Invalid variables make the constructor throw a `LynEnvError`, so testing
that path needs no mock:

```ts
import { Lyn, LynEnvError } from "lyn";

delete Bun.env.DATABASE_URL;
expect(() => new Lyn({ env: { db: { name: "DATABASE_URL", type: "string" } } }))
  .toThrow(LynEnvError);
```
