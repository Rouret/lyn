# Validation

Pass Zod schemas as the third argument of a route. Lyn validates the request
before calling your handler and infers the handler's types from the schemas.

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

Use the `z` exported by Lyn so your schemas share Lyn's Zod version (Zod 4).

Validation runs in this order: **body → params → query**. The first failure
stops the request and returns a `400` error (format in
[Responses & errors](responses-and-errors.md#error-format)).

## Body

Any Zod schema is accepted. The body must be sent as JSON: the request needs
a `Content-Type` of `application/json` (parameters such as `; charset=utf-8`
are fine) or any `+json` type such as `application/merge-patch+json`. The
body is then parsed and validated with `schema.safeParse`, so transforms,
defaults and refinements all apply.

```ts
.post("/users", ({ body }) => body, {
  body: z.object({
    name: z.string().min(1),
    age: z.number().int().positive().optional(),
  }),
})
```

Checks run in this order:

| Situation                                         | Response                         |
| ------------------------------------------------- | -------------------------------- |
| No body, or an empty body                         | `400` `NO_BODY`                  |
| `Content-Type` missing or not JSON                | `415` `UNSUPPORTED_MEDIA_TYPE`   |
| Body is not valid JSON                            | `400` `INVALID_JSON`             |
| Body does not match the schema                    | `400` `VALIDATION` with Zod issues in `cause` |

Clients must send the header. With curl, `-d` alone sends
`application/x-www-form-urlencoded` and gets a `415`:

```bash
curl -H "Content-Type: application/json" -d '{"name":"Ada"}' localhost:3000/users
```

Body schemas are not available on `.get()`.

## Params

The schema must be a `z.object` whose fields are `z.string()` or
`z.number()`. Path params arrive as strings: `z.number()` fields are
converted with `Number(value)` first, then the object is validated with
`safeParse`, so refinements such as `.int()` or `.positive()` apply.

```ts
.get("/users/:userId/posts/:slug", ({ params }) => getPost(params.userId, params.slug), {
  params: z.object({
    userId: z.number().int().positive(), // "42" → 42
    slug: z.string().min(3),             // "007" stays "007"
  }),
})
```

Every key of the schema must be a `:param` of the path. This is checked
when the route is registered, so a typo fails at startup instead of on every
request:

```ts
new Lyn().get("/users/:id", handler, {
  params: z.object({ userId: z.string() }),
});
// Error: Params schema of GET /users/:id declares "userId", which is not a param of the path
```

Path params that are not in the schema are left out of `params`.

| Situation                                                   | Response           |
| ----------------------------------------------------------- | ------------------ |
| Params do not match the schema (`/users/abc`, `/users/4.5` with `.int()`) | `400` `VALIDATION` |

## Query

The schema must be a `z.object` whose fields are `z.string()`, `z.number()` or
`z.boolean()` (optionally `.optional()`).

```ts
.get("/search", ({ query }) => search(query.q, query.page), {
  query: z.object({ q: z.string(), page: z.number() }),
})
```

```bash
curl "localhost:3000/search?q=bun&page=2"
# query = { q: "bun", page: 2 }
```

Each key declared in the schema is read from the query string and converted
to the field's type, then the whole object is validated with
`schema.safeParse` — refinements such as `.min()`, `.int()` or `.email()`
apply.

| Schema field  | Conversion before validation                          |
| ------------- | ----------------------------------------------------- |
| `z.string()`  | raw value                                             |
| `z.number()`  | `Number(value)`; an empty value stays `""` and fails  |
| `z.boolean()` | `"true"`/`"1"` → `true`, `"false"`/`"0"` → `false`, anything else fails |

| Situation                                         | Response            |
| ------------------------------------------------- | ------------------- |
| Required key missing                              | `400` `VALIDATION`  |
| Value of the wrong type (`?age=abc`, `?isAdmin=yes`) | `400` `VALIDATION` |
| Key sent several times (`?tag=a&tag=b`)           | `400` `VALIDATION`  |
| Refinement fails (`.min(2)`, `.int()`…)           | `400` `VALIDATION`  |

An empty query string is validated like any other: it passes when every
field is optional (`query` is `{}`) and lists every missing required field
otherwise. `.optional()` fields are present in `query` when sent and absent
otherwise (`"page" in query` is `false`).
Keys that are not in the schema are ignored.

## Limitations

- No validation for headers or cookies yet.
- No validation of the response body.
- Query fields cannot be arrays yet; a repeated key is rejected.
