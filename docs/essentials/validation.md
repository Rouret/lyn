# Validation

Pass Zod schemas as the third argument of a route. Lyn checks the request
before calling your handler, and types the handler from the schemas.

```ts
import { Lyn, z } from "lyn";

new Lyn().put(
  "/users/:id",
  ({ params, body, query }) => {
    params.id;     // string
    body.email;    // string
    query.notify;  // boolean
    return { ok: true };
  },
  {
    params: z.object({ id: z.string() }),
    body: z.object({ email: z.email() }),
    query: z.object({ notify: z.boolean() }),
  }
);
```

Lyn checks the **body, then params, then query**. The first failure stops
the request with a `400` (see [Errors](errors.md)).

::: tip
Use the `z` exported by `lyn` rather than installing Zod yourself, so your
schemas match Lyn's Zod version (Zod 4).
:::

## Body

Any Zod schema works. The whole Zod feature set applies: refinements,
defaults, transforms.

```ts
.post("/users", ({ body }) => body, {
  body: z.object({
    name: z.string().min(1),
    age: z.number().int().positive().optional(),
  }),
})
```

The body must be JSON, sent with a `Content-Type` of `application/json`
or any `+json` type (`application/merge-patch+json`…). Lyn checks, in order:

| Situation | Response |
| --- | --- |
| No body, or an empty one | `400 NO_BODY` |
| `Content-Type` missing or not JSON | `415 UNSUPPORTED_MEDIA_TYPE` |
| The body is not valid JSON | `400 INVALID_JSON` |
| The body doesn't match the schema | `400 VALIDATION` |

::: warning curl needs the header
`curl -d` alone sends `application/x-www-form-urlencoded`, which gets a `415`:

```bash
curl -H "Content-Type: application/json" -d '{"name":"Ada"}' localhost:3000/users
```
:::

`.get()` routes can't have a body schema.

## Params

Path parameters always arrive as strings. Declare them with a `z.object`
whose fields are `z.string()` or `z.number()`; numbers are converted
before validation.

```ts
.get("/users/:userId/posts/:slug", ({ params }) => getPost(params.userId, params.slug), {
  params: z.object({
    userId: z.number().int().positive(), // "42" → 42, "abc" → 400
    slug: z.string().min(3),             // "007" stays "007"
  }),
})
```

Each key of the schema must be a `:param` of the path. A typo is caught
when the route is registered, not on the first request:

```ts
new Lyn().get("/users/:id", handler, {
  params: z.object({ userId: z.string() }),
});
// Error: Params schema of GET /users/:id declares "userId", which is not a param of the path
```

Parameters you don't declare are not on `params`.

## Query

Declare the query string with a `z.object` whose fields are `z.string()`,
`z.number()` or `z.boolean()`, each optionally `.optional()`.

```ts
.get("/search", ({ query }) => search(query.q, query.page), {
  query: z.object({
    q: z.string(),
    page: z.number().int().optional(),
  }),
})
```

```bash
curl "localhost:3000/search?q=bun&page=2"
# query = { q: "bun", page: 2 }
```

Values are converted to the field's type before validation:

| Field | Accepted values |
| --- | --- |
| `z.string()` | anything, kept as is |
| `z.number()` | anything `Number()` understands; an empty value fails |
| `z.boolean()` | `true` / `1` and `false` / `0`; anything else fails |

A request gets `400 VALIDATION` when a required key is missing, a value
has the wrong type, a key is sent twice (`?tag=a&tag=b`) or a refinement
fails.

- Keys not in the schema are ignored.
- An optional key that isn't sent is absent from `query`
  (`"page" in query` is `false`).

::: info Not supported yet
- Validating headers and cookies.
- Validating the response body.
- Array values in the query string.
:::
