# CORS

By default, a browser only lets a page call your API if the page is served
from the same domain. To allow a frontend hosted elsewhere, enable CORS:

```ts
new Lyn({
  cors: {
    origin: ["https://app.example.com"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  },
});
```

CORS is **disabled** when the option is absent: Lyn sends no CORS header.

## Options

| Option | Type | Default |
| --- | --- | --- |
| `origin` | `"*"`, `string[]` or `(origin) => boolean` | required |
| `credentials` | `boolean` | `false` |
| `allowedHeaders` | `string[]` | the headers the browser asks for; required with `credentials` |
| `exposedHeaders` | `string[]` | `[]` |
| `maxAge` | `number`, in seconds | `600` |

### `origin`

Which sites may call the API:

```ts
origin: "*"                                          // everyone
origin: ["https://app.example.com"]                  // exact matches, scheme and port included
origin: (origin) => origin.endsWith(".example.com")  // decided per request
```

### `credentials`

Lets the browser send cookies and the `Authorization` header. The CORS
spec forbids it with `origin: "*"`, so Lyn throws at startup if you combine
them.

With `credentials`, `allowedHeaders` is required, so that a page cannot
send any header it likes along with your users' cookies. Lyn throws at
startup if it is missing.

### `allowedHeaders` and `exposedHeaders`

`allowedHeaders` limits which request headers the browser may send.
`exposedHeaders` lists the response headers the page may read, on top of
the standard ones:

```ts
cors: {
  origin: ["https://app.example.com"],
  exposedHeaders: ["X-Total-Count"],
}
```

## How it behaves

- Every response from an allowed origin gets the CORS headers, errors
  included (`404`, `405`, `500`).
- Preflight requests (`OPTIONS`) are answered for you, with the methods of
  the path.
- A request from a refused origin is still processed: the browser simply
  hides the response from the page.

::: warning CORS is not access control
CORS protects your users' browsers, not your server. Any other client can
still call your API: check permissions in your handlers. See
[Never trust the client](../guides/best-practices.md#never-trust-the-client).
:::
