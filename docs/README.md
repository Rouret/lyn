# Lyn documentation

Lyn is a lightweight, type-safe backend framework for [Bun](https://bun.sh).
You declare routes with a chainable API, describe inputs with
[Zod](https://zod.dev), and get typed handlers, validation and consistent
error responses out of the box.

```ts
import { Lyn, z } from "lyn";

new Lyn()
  .post(
    "/users",
    ({ body }) => ({ message: `Hello ${body.name}` }),
    { body: z.object({ name: z.string() }) }
  )
  .listen(3000);
```

## Guides

1. [Getting started](getting-started.md) — install, first server, run it
2. [Routing](routing.md) — methods, paths, handlers, the context object
3. [Validation](validation.md) — body, params and query schemas
4. [Responses & errors](responses-and-errors.md) — status codes, headers, error format
5. [Configuration](configuration.md) — `LynConfig`, environment variables, logging
6. [Testing](testing.md) — testing a Lyn app with `bun:test`

## Status

Lyn is at `0.0.1` and not yet published to npm. The API may change.
Authentication is on the roadmap but not available yet.
Each guide ends with a **Limitations** section listing current behaviour you
should know about.
