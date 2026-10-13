# Server

An app does nothing until you start it. This page covers `listen()`,
`stop()`, who may reach the server, and the limits every request gets.

```ts
import { Lyn } from "@rouret/lyn";

const app = await new Lyn().get("/", () => "ok").listen(3000);

app.url;          // "http://127.0.0.1:3000"
await app.stop();
```

## Starting

`listen(port?)` runs the startup checks, such as the
[database connection](../integrations/database.md#startup-and-shutdown),
then starts serving. It returns a promise of the app.

- Without a port, Bun picks a free one. Read it from `app.url`.
- If a check fails, `listen()` rejects and nothing is served.
- `app.url` throws before `listen()`.
- Lyn prints its logo on start. Hide it with `start: { hideLynLogo: true }`.

## Who can reach it

By default the server only accepts connections from **this machine**
(`127.0.0.1`). It is the safe choice for development.

To accept connections from the network, in a container or on a server,
bind every interface and list the domain names you serve:

```ts
new Lyn({
  server: {
    hostname: "0.0.0.0",
    allowedHosts: ["api.example.com"],
  },
});
```

| Option | Default | Effect |
| --- | --- | --- |
| `server.hostname` | `"127.0.0.1"` | The interface `listen()` binds. `"0.0.0.0"` and `"::"` mean every interface |
| `server.allowedHosts` | `127.0.0.1`, `localhost`, `::1` | The names accepted in the `Host` header, on top of the defaults |

While the server is running, a request whose `Host` header is not allowed
gets `400 INVALID_HOST`. This blocks DNS rebinding: a malicious page
can't use a visitor's browser to reach your local API. Only the name is
checked, with or without a port. The bind address is allowed for you,
unless it is a wildcard.

With `"0.0.0.0"`, `app.url` stays a loopback URL, because `0.0.0.0` is
not an address you can request.

## Limits

Every request gets two limits:

| Option | Default | When it is exceeded |
| --- | --- | --- |
| `server.maxBodyBytes` | `1048576` (1 MiB) | `413 PAYLOAD_TOO_LARGE`, before the body is parsed |
| `server.requestTimeoutMs` | `30000` (30 seconds) | `408 REQUEST_TIMEOUT` |

```ts
new Lyn({
  server: {
    maxBodyBytes: 64 * 1024,  // 64 KiB
    requestTimeoutMs: 10_000, // 10 seconds
  },
});
```

The timeout covers reading the body and running the handler. Lyn can't
interrupt your code, but it aborts the handler's
[`signal`](handlers.md#timeouts-and-cancellation) and, with a database,
Postgres cancels the running query.

## Stopping

`stop()` stops the server, then closes the database connection.

Lyn calls it for you when the process receives `SIGINT` (Ctrl+C) or
`SIGTERM` (`docker stop`, Kubernetes), then lets the process exit. If
your code listens to that signal too, Lyn still stops the app but leaves
the exit to you.

## Without a server

`app.handle(request)` runs a standard `Request` through the app and
returns the `Response`, without opening a port. The server calls it for
every request, so the behaviour is identical. It is how you
[test](../guides/testing.md) an app.

```ts
const response = await app.handle(new Request("http://localhost/"));
await response.text(); // "ok"
```

`handle()` does not check `Host`: you built the request yourself.

You can run several `Lyn` apps in the same process.
