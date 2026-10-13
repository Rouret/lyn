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
With [CORS](cors.md), add it to `exposedHeaders` so the browser lets your
frontend read it.

Rate limiting is **disabled** when the option is absent.

## Options

| Option | Type | Default |
| --- | --- | --- |
| `max` | `number` | required |
| `windowMs` | `number`, in milliseconds | `60000` |
| `key` | `(request, { ip }) => string \| undefined` | the client IP |
| `skip` | `(request, { ip }) => boolean` | none |

`key` and `skip` may be `async`.

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

The same goes for any value the client sends: see
[Never trust the client](../guides/best-practices.md#never-trust-the-client).

Return `undefined` from `key` to skip the limit for a request that has
no client to count.

If `key` or `skip` throws, the request gets a `500`. Throw a Lyn error to
answer with its status instead.

## Skipping requests

`skip` lets a request through without counting it. Use it for your own
rules, such as a health check or clients on a paid plan:

```ts
rateLimit: {
  max: 100,
  skip: async (request) =>
    new URL(request.url).pathname === "/health" ||
    (await isPremium(request.headers.get("Authorization"))),
}
```

`app.handle()` has no connection, so with the default `key` it is never
limited.

## How it behaves

- Counters live in memory, per process. With several instances, each one
  counts on its own, and a restart resets them.
- CORS preflight requests are never counted.
- Windows are fixed: a client can send up to `2 × max` requests around the
  end of one window and the start of the next.
- Lyn tracks up to 100,000 new clients per window. Past that, for example
  during a flood from many addresses, it forgets the oldest counters to
  keep memory bounded, so those clients get a new budget early.
- An IPv6 client can often switch between many addresses. If that matters,
  group them in `key`, or limit at your proxy.

::: info Not supported yet
- Different limits per route.
- A shared store, such as Redis, for several instances.
:::
