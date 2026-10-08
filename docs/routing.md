# Routing

## Declaring routes

A Lyn app is a chain of route declarations ending with `listen()`:

```ts
const app = new Lyn()
  .get("/users", listUsers)
  .post("/users", createUser, { body: userSchema })
  .put("/users/:id", updateUser, { params: idSchema, body: userSchema })
  .delete("/users/:id", deleteUser, { params: idSchema })
  .listen(3000);
```

Each method has the signature:

```ts
app.METHOD(path: string, handler: (ctx) => response, validation?: { body?, params?, query? })
```

| Method     | Body schema allowed | Default status |
| ---------- | ------------------- | -------------- |
| `.get`     | no                  | 200            |
| `.post`    | yes                 | 201            |
| `.put`     | yes                 | 200            |
| `.delete`  | yes                 | 204            |

Other HTTP methods (PATCH, HEAD…) cannot be registered yet. `OPTIONS` is
answered automatically (see below).

## Paths

Paths must start with `/` and are made of segments:

- static: `/users`
- parameter: `/users/:id` → available as `params.id` (see [Validation](validation.md#params)).
  Values are URL-decoded (`/users/j%C3%A9r%C3%B4me` → `"jérôme"`).
- wildcard: `/files/*` → matches `/files` and everything below it. It must be
  the last segment.

When several routes could match, the most specific wins, segment by segment:
**static > parameter > wildcard**. So `/users/me`, `/users/:id` and
`/users/*` can coexist. Trailing and duplicate slashes are ignored
(`/users/` matches `/users`).

Requests that match nothing get a JSON error:

| Situation                              | Response                                      |
| -------------------------------------- | --------------------------------------------- |
| No route for this path                 | `404` `NOT_FOUND`                             |
| Path exists, but not for this method   | `405` `METHOD_NOT_ALLOWED` + `Allow` header   |
| `OPTIONS` on an existing path          | `204` + `Allow: GET, POST, OPTIONS` (+ CORS preflight headers when [CORS](configuration.md#cors) is enabled) |

Registration errors are thrown immediately, before the server starts:

- empty path → `Route path cannot be empty`
- path without a leading slash → `Route path must start with "/": users`
- wildcard not last → `Wildcard must be the last segment: /files/*/meta`
- same method and path twice (`/users/:id` and `/users/:userId` count as the
  same path) → `Route GET /users/:userId is already registered`
- params schema key that is not a `:param` of the path →
  `Params schema of GET /users/:id declares "userId", which is not a param of the path`

## Handlers and the context

Handlers receive a single context object and return the response body:

```ts
.post("/users", ({ body, params, query, request, set }) => { ... })
```

| Field     | Type                          | Present when                     |
| --------- | ----------------------------- | -------------------------------- |
| `request` | `Request` (standard Web API)  | always                           |
| `set`     | `{ status: number; headers: Headers }` | always                  |
| `body`    | inferred from `validation.body`   | a body schema is given       |
| `params`  | inferred from `validation.params` | a params schema is given     |
| `query`   | inferred from `validation.query`  | a query schema is given      |

`body`, `params` and `query` are only typed — and only populated — when the
matching schema is passed. Without a schema, read raw data from `request`
(`new URL(request.url).searchParams`, `await request.json()`).

Handlers can be `async`:

```ts
.get("/users", async () => {
  const users = await db.users.findMany();
  return { users };
})
```

What you return and how to change status/headers is covered in
[Responses & errors](responses-and-errors.md).

## Starting and stopping

```ts
const app = new Lyn().get("/", () => "ok").listen(3000);

app.url;        // "http://127.0.0.1:3000"
await app.stop();
```

- `listen(port?)` — starts the server. Omit the port (or pass `0`) to get a
  random free port, handy in tests. Connections idle for more than 30 s are
  closed.
- `url` — base URL of the running server; throws if `listen()` was not called.
- `stop()` — stops the server. Lyn also stops it on process `beforeExit`.
- `handle(request)` — runs a standard `Request` through the app and returns
  its `Response`, without any server. `listen()` uses it for every request,
  so behaviour is identical. Useful for [tests](testing.md) and for mounting
  Lyn inside another runtime handler.

You can create as many `Lyn` instances as you want in one process.

## Limitations

- Only GET, POST, PUT and DELETE.
- No route groups, prefixes, middlewares or plugins yet.
