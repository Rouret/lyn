# Logging

Lyn logs with [pino](https://getpino.io). It writes one line per request,
and the full stack trace of unexpected errors.

## Settings

Logging is configured with two environment variables:

| Variable | Effect |
| --- | --- |
| `NODE_ENV` | `production`: one JSON object per line, for log collectors. Anything else: readable, colored output. |
| `LOG_LEVEL` | `fatal`, `error`, `warn`, `info` (default), `debug`, `trace` or `silent` |

An invalid `LOG_LEVEL` stops the app with a `LynEnvError`.

## Request logs

Each request produces one line with its `requestId`, `method`, `path`,
`status` and `durationMs`:

```json
{"level":30,"requestId":"43297dd3-…","method":"GET","path":"/users","status":200,"durationMs":0.95,"msg":"[Lyn] GET /users 200 0.95ms"}
```

The level follows the status: `info` below `400`, `warn` for `4xx`,
`error` for `5xx`.

Lyn's own messages start with `[Lyn]`.

To also log each SQL query, see [Query logs](../integrations/database.md#query-logs).

## Request ids

Each request gets an id, sent back in the `X-Request-Id` response header and
added to every log line of that request. When a client reports a problem,
the id leads you to its logs and stack trace.

If the request already has an `X-Request-Id` header (set by a proxy, for
example), Lyn reuses it, as long as it is 1 to 128 characters among
`A-Z a-z 0-9 . _ -`. Otherwise it generates a UUID.

## Your own logs

Use the exported `logger`. It shares Lyn's level and output format:

```ts
import { logger } from "@rouret/lyn";

.post("/orders", ({ body }) => {
  logger.info({ orderId: body.id }, "order received");
  return { ok: true };
})
```

::: info Not supported yet
- Sending logs to a custom destination.
:::
