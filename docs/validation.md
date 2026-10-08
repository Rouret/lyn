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

Each declared key is read from the query string and converted:

| Schema field  | Conversion                                  |
| ------------- | ------------------------------------------- |
| `z.string()`  | raw value                                   |
| `z.number()`  | `Number(value)`                             |
| `z.boolean()` | `true` if `"true"` or `"1"`, otherwise `false` |

If the request has no query string at all, Lyn returns `400` `NO_QUERY`.

> **Important — query values are converted, not validated.** The Zod schema
> is not executed on the query today. Concretely:
>
> - a missing key is simply absent from `query` (no 400),
> - a non-numeric value for a `z.number()` field becomes `NaN`,
> - a key sent several times (`?tag=a&tag=b`) is dropped,
> - `.optional()` fields are always dropped,
> - refinements such as `.min()` or `.email()` are ignored.
>
> Re-check critical query values in your handler until this is fixed.

## Limitations

- No validation for headers or cookies yet.
- No validation of the response body.
- See the notes above for params coercion and query validation.
