# Rate limiting

Without a limit, one client can flood your API, or try thousands of
passwords on a login route. Limit how many requests each client may send:

```ts
new Lyn({
  rateLimit: { max: 100, windowMs: 60_000 },
});
```

Each client gets `max` requests per window. The next ones get a `429`
until the window ends:

```json
{ "code": "TOO_MANY_REQUESTS", "message": "Too many requests, retry later" }
```

The `Retry-After` header gives the seconds left before the window ends.

Rate limiting is **disabled** when the option is absent.

## Options

| Option | Type | Default |
| --- | --- | --- |
| `max` | `number` | required |
| `windowMs` | `number`, in milliseconds | `60000` |
| `key` | `(request, { ip }) => string \| undefined` | the client IP |

## Identifying clients

By default, a client is the IP address of the connection. Every request
counts, unknown routes included.

Behind a reverse proxy or a load balancer, every connection comes from the
proxy, so all your users share one budget. Read the client IP from the
header your proxy sets instead:

```ts
rateLimit: {
  max: 100,
  key: (request) => request.headers.get("X-Real-IP") ?? undefined,
}
```

::: warning Only trust a header your proxy sets
A client can send `X-Real-IP` or `X-Forwarded-For` itself. Read it only
when your proxy overwrites it, otherwise anyone can pick a new IP on each
request.
:::

Return `undefined` from `key` to skip the limit for a request, for
example a health check.

`app.handle()` has no connection, so with the default `key` it is never
limited.

## How it behaves

- Counters live in memory, per process. With several instances, each one
  counts on its own, and a restart resets them.
- An IPv6 client can often switch between many addresses. If that matters,
  group them in `key`, or limit at your proxy.

::: info Not supported yet
- Different limits per route.
- A shared store, such as Redis, for several instances.
:::
