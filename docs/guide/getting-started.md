# Getting started

## Requirements

- [Bun](https://bun.sh) `1.3.6` or later
- TypeScript `5.9` or later

## Installation

Lyn is not on npm yet. Until it is, clone it next to your project:

```bash
git clone https://github.com/Rouret/lyn.git
cd lyn && bun install
```

Then map the `@rouret/lyn` imports to the clone in your project's `tsconfig.json`.
Bun reads these paths at runtime, so no build step is needed. The `#/*`
entry is Lyn's internal alias: your editor needs it to type-check Lyn's
code.

```json
{
  "compilerOptions": {
    "paths": {
      "@rouret/lyn": ["../lyn/src/index.ts"],
      "@rouret/lyn/db": ["../lyn/src/db.ts"],
      "#/*": ["../lyn/src/*"]
    }
  }
}
```

Every example in this documentation imports from `@rouret/lyn`, as it will once the
package is published.

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

## What Lyn exports

```ts
import { Lyn, z, logger, LynEnvError, LynDatabaseError } from "@rouret/lyn";
```

| Export | What it is |
| --- | --- |
| `Lyn` | The application class |
| `z` | Zod, re-exported so your schemas use the same version as Lyn |
| `logger` | The [logger](../configuration/logging.md) Lyn uses, for your own logs |
| `LynEnvError` | Thrown by `new Lyn()` when [environment variables](../configuration/environment-variables.md) are invalid |
| `LynDatabaseError` | Thrown by `listen()` when the [database](../integrations/database.md) is unreachable |

Drizzle helpers for the database come from `@rouret/lyn/db`.

## Next steps

- [Routing](../essentials/routing.md): paths, parameters and route priority.
- [Validation](../essentials/validation.md): body, params and query in detail.
- [Database](../integrations/database.md): connect Postgres.
