# What is Lyn?

Lyn is a small backend framework for [Bun](https://bun.sh), written in
TypeScript. You chain routes, describe their inputs with
[Zod](https://zod.dev), and Lyn gives you typed handlers, request
validation and consistent JSON errors.

```ts
import { Lyn, z } from "@rouret/lyn";

await new Lyn()
  .get("/", () => "Hello World")
  .post(
    "/users",
    ({ body }) => ({ message: `Hello ${body.name}` }),
    { body: z.object({ name: z.string() }) }
  )
  .listen(3000);
```

## Who it is for

Lyn is made for **proofs of concept, solo developers and agencies**: people
who want a working, safe API quickly, without having to assemble a stack first.

It doesn't try to replace general-purpose frameworks. It makes a few choices
for you so you can start writing routes right away.

## What you get

| | |
| --- | --- |
| **Typed handlers** | `body`, `params` and `query` are typed from your Zod schemas. Without a schema, they don't exist on the context. |
| **Validation** | Invalid requests are rejected with a `400` before your handler runs. |
| **One error format** | Every error, from `404` to a crash in your code, is the same JSON shape. Internal details never leak. |
| **Checked configuration** | Environment variables are validated and typed when the app starts, not when they are first used. |
| **Postgres built in** | Pass a Drizzle schema, get a typed `db` in every handler. |
| **Logs** | One log line per request, with a request id, ready for production. |
| **Tests without a server** | `app.handle(request)` runs a request through the app in memory. |

## What it doesn't do (yet)

- **Not on npm yet.** Lyn is at `0.0.1` and its API can still change.
  [Getting started](getting-started.md) shows how to use it from a clone.
- **Bun only.** Lyn does not run on Node.js or Deno.
- **No authentication yet.** It is the next big feature.
- **No middlewares, route groups or plugins** for now.

Each page ends with what is not supported yet on its topic.

## Next steps

- [Getting started](getting-started.md): your first server in five minutes.
- [Routing](../essentials/routing.md): how routes and paths work.
