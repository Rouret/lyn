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

Any Zod schema is accepted. The body is read as JSON and parsed with
`schema.safeParse`, so transforms, defaults and refinements all apply.

```ts
.post("/users", ({ body }) => body, {
  body: z.object({
    name: z.string().min(1),
    age: z.number().int().positive().optional(),
  }),
})
```

| Situation                         | Response                    |
| --------------------------------- | --------------------------- |
| No body sent                      | `400` `NO_BODY`             |
| Body does not match the schema    | `400` `VALIDATION` with Zod issues in `cause` |
| Body is not valid JSON            | `500` `INTERNAL_SERVER_ERROR` |

Body schemas are not available on `.get()`.

## Params

The schema must be a `z.object` whose fields are `z.string()`, `z.number()` or
arrays of those. It is run with `safeParse` against Bun's route params.

```ts
.get("/posts/:slug", ({ params }) => getPost(params.slug), {
  params: z.object({ slug: z.string().min(3) }),
})
```

| Situation                          | Response              |
| ---------------------------------- | --------------------- |
| Route has no params                | `400` `NO_PARAMS`     |
| Params do not match the schema     | `400` `VALIDATION`    |

> Path params always arrive as strings and are **not coerced**. A
> `z.number()` param will always fail validation. Declare `z.string()` and
> convert in the handler (`Number(params.id)`).

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
- See the note above about params coercion.
