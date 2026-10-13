# Getting started

## Requirements

- [Bun](https://bun.sh) `1.3.6` or later
- TypeScript `5.9` or later

## Installation

```bash
bun add @rouret/lyn
```

## Your first server

Create `server.ts`:

```ts
import { Lyn, z } from "@rouret/lyn";

await new Lyn()
  .get("/", () => "Hello World")
  .get(
    "/hello/:name",
    ({ params }) => ({ message: `Hello ${params.name}` }),
    { params: z.object({ name: z.string() }) }
  )
  .listen(3000);
```

Start it. `NODE_ENV` is required: Lyn refuses to start without it.

```bash
NODE_ENV=development bun --hot run server.ts
```

```bash
curl localhost:3000/hello/Ada
# {"message":"Hello Ada"}
```

Lyn prints its logo, then one log line per request.

## Accepting data

Add a route that receives JSON. The body is validated before your handler
runs, and `body` is typed from the schema:

```ts
.post(
  "/users",
  ({ body }) => ({ id: crypto.randomUUID(), ...body }),
  {
    body: z.object({
      name: z.string().min(1),
      email: z.email(),
    }),
  }
)
```

```bash
curl -X POST localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada"}'
```

```json
{
  "code": "VALIDATION",
  "message": "Bad Request",
  "cause": [{ "expected": "string", "code": "invalid_type", "path": ["email"], "message": "Invalid input: expected string, received undefined" }]
}
```

Send a valid email and you get a `201 Created` with the new user.

## Next steps

Pick the next step that matches what you are building:

| You want to | Read |
| --- | --- |
| Organise a growing app in several files | [Project structure](project-structure.md) |
| Understand paths, parameters and priority | [Routing](../essentials/routing.md) |
| Validate bodies, params and query strings | [Validation](../essentials/validation.md) |
| Store data in Postgres | [Database](../integrations/database.md) |
| Test your routes | [Testing](../guides/testing.md) |
| Ship fast without shipping badly | [Best practices](../guides/best-practices.md) |
| Deploy with Docker | [Production](../guides/production.md) |

Everything Lyn exports is listed in the [API reference](../reference/api.md).
