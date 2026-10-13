# Handlers

A handler receives one context object and returns the response body.

```ts
.post("/users", ({ body, params, query, request, set, db }) => {
  // ...
})
```

## The context

| Field | Type | Available |
| --- | --- | --- |
| `request` | the standard `Request` | always |
| `set` | `{ status: number; headers: Headers }` | always |
| `signal` | an `AbortSignal`, aborted on [timeout](#timeouts-and-cancellation) or when the client disconnects | always |
| `body` | inferred from the body schema | when a [body schema](validation.md#body) is given |
| `params` | inferred from the params schema | when a [params schema](validation.md#params) is given |
| `query` | inferred from the query schema | when a [query schema](validation.md#query) is given |
| `db` | your typed Drizzle instance | when a [database](../integrations/database.md) is configured |

`body`, `params` and `query` don't exist without a schema: TypeScript
won't let you use them. To read raw data instead, use `request`:

```ts
.get("/raw", async ({ request }) => {
  const url = new URL(request.url);
  return { search: url.searchParams.get("q") };
})
```

Handlers can be `async`:

```ts
.get("/users", async ({ db }) => {
  const users = await db.query.users.findMany();
  return { users };
})
```

## Returning a response

What the handler returns becomes the response body:

| You return | Body | `Content-Type` |
| --- | --- | --- |
| a `string` | the string | `text/plain; charset=utf-8` |
| an object, an array or `null` | JSON | `application/json` |
| nothing | empty | none |

```ts
.get("/text", () => "Hello")                // text/plain
.get("/json", () => ({ hello: "world" }))   // application/json
.post("/jobs", ({ set }) => {               // empty body, 202
  set.status = 202;
})
```

::: warning
Returning a `Response` object is not supported: it would be sent as JSON.
:::

What you return is sent as is. Return a DTO built for the client, not a
database row: see
[Never return a database row](../guides/best-practices.md#never-return-a-database-row).

## Status and headers

Change the status or add headers with `set`:

```ts
.post("/users", ({ body, set }) => {
  set.status = 202;
  set.headers.set("Location", `/users/${body.id}`);
  set.headers.set("Cache-Control", "no-store");
  return { queued: true };
})
```

- `set.status` starts at the method's default: `200` for GET and PUT,
  `201` for POST, `204` for DELETE.
- `set.headers` is a standard `Headers` object. If you set `Content-Type`,
  Lyn keeps it:

```ts
.get("/", ({ set }) => {
  set.headers.set("Content-Type", "text/html; charset=utf-8");
  return "<h1>Hello</h1>";
})
```

::: tip DELETE returns no body by default
`204 No Content` has no body, so what a `.delete()` handler returns is
dropped. Set `set.status = 200` to send it.
:::

Every response also gets an `X-Request-Id` header, which matches the
request's [log line](../configuration/logging.md#request-ids), and
`X-Content-Type-Options: nosniff`, so browsers never run a JSON or text
response as another type. Set your own `X-Content-Type-Options` with
`set.headers` to replace it.

## Timeouts and cancellation

A request has 30 seconds, body included. After that Lyn answers
`408 REQUEST_TIMEOUT`. Change it with
[`server.requestTimeoutMs`](server.md#limits).

Lyn can't stop your code, but it tells it to stop: `signal` is aborted at
the timeout, or as soon as the client disconnects. Pass it to `fetch`, or
check `signal.aborted` between long steps:

```ts
.get("/weather", async ({ signal }) => {
  const response = await fetch("https://api.example.com/weather", { signal });
  return response.json();
})
```

With a [database](../integrations/database.md#statement-timeout),
Postgres also cancels any query that runs longer than the request
timeout.

::: info Not supported yet
- Streaming, files or a custom `Response`.
:::
