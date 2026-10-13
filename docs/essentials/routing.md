# Routing

## Declaring routes

An app is a chain of routes. Each method returns the app, so you can keep
chaining:

```ts
import { Lyn, z } from "@rouret/lyn";

const users = new Map<string, { name: string }>();
const idSchema = z.object({ id: z.string() });
const userSchema = z.object({ name: z.string().min(1) });

const app = new Lyn()
  .get("/users", () => [...users.values()])
  .post("/users", ({ body }) => {
    const id = crypto.randomUUID();
    users.set(id, body);
    return { id, ...body };
  }, { body: userSchema })
  .put("/users/:id", ({ params, body }) => {
    users.set(params.id, body);
    return { id: params.id, ...body };
  }, { params: idSchema, body: userSchema })
  .delete("/users/:id", ({ params }) => {
    users.delete(params.id);
  }, { params: idSchema });

await app.listen(3000);
```

Every method takes the same three arguments:

```ts
app.get(path, handler, validation?)
```

- `path`: where the route lives (see [Paths](#paths)).
- `handler`: the function that answers (see [Handlers](handlers.md)).
- `validation`: optional Zod schemas for `body`, `params` and `query`
  (see [Validation](validation.md)).

| Method | Default status | Accepts a body schema |
| --- | --- | --- |
| `.get()` | `200` | no |
| `.post()` | `201` | yes |
| `.put()` | `200` | yes |
| `.delete()` | `204` | yes |

`OPTIONS` requests are answered for you.

## Paths

A path starts with `/` and is made of segments of three kinds:

| Segment | Example | Matches |
| --- | --- | --- |
| Static | `/users` | exactly `/users` |
| Parameter | `/users/:id` | `/users/42`, `/users/ada` → `params.id` |
| Wildcard | `/files/*` | `/files` and everything below it |

- Parameter values are URL-decoded: `/users/j%C3%A9r%C3%B4me` gives `"jérôme"`.
- A wildcard must be the last segment.
- Trailing and double slashes are ignored: `/users/` matches `/users`.

To read a parameter in your handler, declare it in a
[params schema](validation.md#params).

### Which route wins

When several routes match, the most specific wins, segment by segment:
**static, then parameter, then wildcard**. These three routes can coexist:

```ts
new Lyn()
  .get("/users/me", () => "me")          // GET /users/me
  .get("/users/:id", () => "one user")   // GET /users/42
  .get("/users/*", () => "fallback");    // GET /users/42/avatar
```

Declaration order doesn't matter: `/users/me` wins even when it is
declared last.

## When nothing matches

| Request | Response |
| --- | --- |
| No route has this path | `404 NOT_FOUND` |
| The path exists, but not for this method | `405 METHOD_NOT_ALLOWED`, with an `Allow` header |
| `OPTIONS` on an existing path | `204`, with an `Allow` header (and [CORS](../configuration/cors.md) headers when enabled) |

## Mistakes caught at startup

A badly declared route throws as soon as it is registered, before the
server starts:

| Mistake | Error |
| --- | --- |
| Empty path | `Route path cannot be empty` |
| No leading slash | `Route path must start with "/": users` |
| Wildcard not last | `Wildcard must be the last segment: /files/*/meta` |
| Same method and path twice | `Route GET /users/:userId is already registered` |
| Params schema key missing from the path | `Params schema of GET /users/:id declares "userId", which is not a param of the path` |

`/users/:id` and `/users/:userId` count as the same path.

## Starting the server

Routes answer once the app is started with `listen()`, or through
`handle()` in tests. See [Server](server.md).

::: info Not supported yet
- `PATCH`, `HEAD` and other methods.
- Route groups, prefixes, middlewares and plugins.
:::
