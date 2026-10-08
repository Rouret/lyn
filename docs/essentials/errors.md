# Errors

## The error format

Every error Lyn sends has the same JSON shape:

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

- `code`: a stable identifier your client can test.
- `message`: a human-readable explanation.
- `cause`: extra details, when there are some. For `VALIDATION`, the list
  of Zod issues.

## Error codes

| Code | Status | When |
| --- | --- | --- |
| `VALIDATION` | `400` | The body, params or query don't match their schema |
| `NO_BODY` | `400` | A body schema is declared, but no body was sent |
| `INVALID_JSON` | `400` | The body is not valid JSON |
| `UNSUPPORTED_MEDIA_TYPE` | `415` | A body schema is declared, but the `Content-Type` is not JSON |
| `NOT_FOUND` | `404` | No route has this path |
| `METHOD_NOT_ALLOWED` | `405` | The path exists, but not for this method. The `Allow` header lists the valid ones |
| `INTERNAL_SERVER_ERROR` | `500` | Your handler threw an unexpected error |

## Unexpected errors

If a handler throws, the client gets a generic `500`. The real error is
logged on the server with the request id, and is **never** sent to the
client:

```ts
.get("/boom", () => {
  throw new Error("db password is wrong");
})
```

```json
{ "code": "INTERNAL_SERVER_ERROR", "message": "Internal Server Error" }
```

## Sending your own errors

To answer with your own status and code, throw an error that has
`isLynError: true`, a `code` and a `status`:

```ts
const notFound = (message: string) =>
  Object.assign(new Error(message), {
    isLynError: true,
    code: "NOT_FOUND",
    status: 404,
  });

.get(
  "/users/:id",
  ({ params }) => {
    const user = users.find((user) => user.id === params.id);
    if (!user) throw notFound("User not found");
    return user;
  },
  { params: z.object({ id: z.string() }) }
)
```

```json
{ "code": "NOT_FOUND", "message": "User not found" }
```

::: info Not supported yet
- An exported `LynError` class to extend. Until then, use the
  `isLynError` object above.
:::
