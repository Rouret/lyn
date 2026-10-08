# Getting started

## Requirements

- [Bun](https://bun.sh) `>= 1.3.6`. Lyn does not run on Node.js or Deno;
  `listen()` throws `"Lyn can only be used on Bun"` elsewhere.
- TypeScript `^5.9`.

## Installation

Lyn is not on npm yet. Until it is, use it from a clone of the repository:

```bash
git clone https://github.com/rouret/lyn.git
cd lyn
bun install
```

and import from `src/index.ts` (the package entry point).

## Your first server

Create `server.ts`:

```ts
import { Lyn, z } from "./src";

new Lyn()
  .get("/", () => "Hello World")
  .get("/json", () => ({ message: "Hello World" }))
  .get(
    "/hello/:name",
    ({ params }) => ({ message: `Hello ${params.name}` }),
    { params: z.object({ name: z.string() }) }
  )
  .listen(3000);
```

Run it. `NODE_ENV` is **required** — Lyn exits with code 1 at startup if it is
missing:

```bash
NODE_ENV=development bun --hot run server.ts
```

```bash
curl localhost:3000/hello/Ada
# {"message":"Hello Ada"}
```

On startup Lyn prints its logo, validates environment variables and logs
`[Lyn] Server is running on port 3000`. Every request and response is logged.

## The repository sandbox

The repo ships a playground at `testing/local.ts`:

```bash
NODE_ENV=development bun run dev
```

## Exports

```ts
import { Lyn, z, logger } from "lyn";
```

| Export   | What it is                                                |
| -------- | --------------------------------------------------------- |
| `Lyn`    | The application class                                     |
| `z`      | Zod, re-exported so your schemas match Lyn's Zod version  |
| `logger` | A [pino](https://getpino.io) logger with pretty output    |

Next: [Routing](routing.md).
