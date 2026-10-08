# API reference

A summary of everything Lyn exposes. Each entry links to the page that
explains it.

## Exports

```ts
import { Lyn, z, logger, LynEnvError, LynDatabaseError } from "lyn";
import { pgTable, text, eq, sql /* … */ } from "lyn/db";
```

| Export | Description |
| --- | --- |
| `Lyn` | The application class |
| `z` | Zod 4, re-exported |
| `logger` | The pino logger used by Lyn · [Logging](../configuration/logging.md#your-own-logs) |
| `LynEnvError` | Thrown by `new Lyn()` on invalid environment variables · [Environment variables](../configuration/environment-variables.md#when-something-is-wrong) |
| `LynDatabaseError` | Thrown by `listen()` when the database is unreachable · [Database](../integrations/database.md#startup-and-shutdown) |
| `lyn/db` | Everything from `drizzle-orm` and `drizzle-orm/pg-core` · [Database](../integrations/database.md) |

## `new Lyn(config?)`

Creates an app. Reads and checks the environment variables right away.

| Option | Type | Page |
| --- | --- | --- |
| `env` | `Record<string, { name: string; type: "string" \| "number" \| "boolean" }>` | [Environment variables](../configuration/environment-variables.md) |
| `cors` | `{ origin, credentials?, allowedHeaders?, exposedHeaders?, maxAge? }` | [CORS](../configuration/cors.md) |
| `database` | `{ schema, url? }` | [Database](../integrations/database.md) |
| `start.hideLynLogo` | `boolean` | [Configuration](../configuration/overview.md) |

## Routes

```ts
app.get(path, handler, validation?)
app.post(path, handler, validation?)
app.put(path, handler, validation?)
app.delete(path, handler, validation?)
```

Each returns the app, for chaining. `validation` is
`{ body?, params?, query? }`, with no `body` on `get`.
See [Routing](../essentials/routing.md) and [Validation](../essentials/validation.md).

## Handler context

| Field | Description |
| --- | --- |
| `request` | The standard `Request` |
| `set.status` | Response status, defaults to the method's |
| `set.headers` | Response `Headers` |
| `body`, `params`, `query` | Validated inputs, when a schema is given |
| `db` | Typed Drizzle instance, when a database is configured |

See [Handlers](../essentials/handlers.md).

## App members

| Member | Description |
| --- | --- |
| `listen(port?)` | Runs the startup checks, then serves. Returns a promise of the app. |
| `stop()` | Stops the server and closes the database connection. |
| `handle(request)` | Runs a `Request` through the app without a server. Returns a promise of the `Response`. |
| `url` | Base URL of the running server. Throws before `listen()`. |
| `env` | Parsed environment variables, typed from `config.env`. |
| `db` | The Drizzle instance. A type error without `config.database`. |

## Error codes

`VALIDATION`, `NO_BODY`, `INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`,
`NOT_FOUND`, `METHOD_NOT_ALLOWED`, `CONFLICT`, `INTERNAL_SERVER_ERROR`.
See [Errors](../essentials/errors.md#error-codes).
