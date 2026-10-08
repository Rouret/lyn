# Responses & errors

## Returning a response

Whatever the handler returns becomes the response body:

| Returned value          | Body                 | `Content-Type`       |
| ----------------------- | -------------------- | -------------------- |
| `string`                | the string           | `text/plain`         |
| object, array or `null` | `JSON.stringify(...)`| `application/json`   |

```ts
.get("/text", () => "Hello")            // text/plain
.get("/json", () => ({ hello: "world" })) // application/json
```

Every successful response also carries `Access-Control-Allow-Origin: *`.

Returning a `Response` object yourself is not supported: it would be
serialised as JSON.

## Status code and headers: `set`

Each request gets a mutable `set` object in its context:

```ts
.post("/users", ({ body, set }) => {
  set.status = 202;
  set.headers.set("Location", `/users/${body.id}`);
  set.headers.set("Cache-Control", "no-store");
  return { queued: true };
})
```

- `set.status` starts at the method's default: GET 200, POST 201, PUT 200,
  DELETE 204.
- `set.headers` is a standard `Headers` instance. `Content-Type` and
  `Access-Control-Allow-Origin` are set by Lyn after your handler runs and
  override your values.

> A `204` response has no body, so anything returned from a `.delete()`
> handler is discarded unless you change `set.status` (e.g. to `200`).

## Error format

When something goes wrong, Lyn answers with a JSON body:

```json
{
  "code": "VALIDATION",
  "message": "Bad Request",
  "cause": [
    {
      "expected": "string",
      "code": "invalid_type",
      "path": ["name"],
      "message": "Invalid input: expected string, received undefined"
    }
  ]
}
```

| `code`                   | Status | When                                        |
| ------------------------ | ------ | ------------------------------------------- |
| `VALIDATION`             | 400    | body or params fail their schema; `cause` holds the Zod issues |
| `NO_BODY`                | 400    | a body schema exists but no body, or an empty body, was sent |
| `INVALID_JSON`           | 400    | the body is not valid JSON                  |
| `UNSUPPORTED_MEDIA_TYPE` | 415    | a body schema exists but the `Content-Type` is missing or not JSON |
| `NOT_FOUND`              | 404    | no route matches the path                   |
| `METHOD_NOT_ALLOWED`     | 405    | the path exists but not for this method; `Allow` header lists valid methods |
| `INTERNAL_SERVER_ERROR`  | 500    | any other error thrown by your handler      |

## Throwing errors from a handler

Any error thrown from a handler that is not a Lyn error becomes a generic
`500 INTERNAL_SERVER_ERROR`. The original error is logged server-side and
**never** sent to the client.

```ts
.get("/boom", () => {
  throw new Error("db password is wrong"); // client sees only INTERNAL_SERVER_ERROR
})
```

To answer with a custom status and code, throw an object that has
`isLynError: true`, a `code`, a `status` and a `message`:

```ts
const notFound = (message: string) =>
  Object.assign(new Error(message), {
    isLynError: true,
    code: "NOT_FOUND",
    status: 404,
  });

.get("/users/:id", ({ params }) => {
  const user = users.find((u) => u.id === params.id);
  if (!user) throw notFound("User not found");
  return user;
}, { params: z.object({ id: z.string() }) })
```

```json
{ "code": "NOT_FOUND", "message": "User not found" }
```

The `LynError` class that does this is not exported publicly yet.

## Limitations

- Error responses do not carry the `Access-Control-Allow-Origin` header.
- CORS is fixed to `Access-Control-Allow-Origin: *` and not configurable yet.
- No streaming, file or custom `Response` return values.
