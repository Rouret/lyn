# Configuration

## `LynConfig`

Pass an optional config object to the constructor:

```ts
new Lyn({
  env: {
    databaseUrl: { name: "DATABASE_URL", type: "string" },
  },
  start: {
    hideLynLogo: true,
  },
});
```

| Option              | Type        | Default | Description                                   |
| ------------------- | ----------- | ------- | --------------------------------------------- |
| `env`               | `EnvConfig` | `{}`    | Extra environment variables to load and check |
| `cors`              | `CorsConfig`| none    | Allow browsers on other origins to call the API — see [CORS](#cors) |
| `start.hideLynLogo` | `boolean`   | `false` | Hide the ASCII logo printed by `listen()`     |

## Environment variables

Lyn reads and checks environment variables **once, when `new Lyn()` runs**.
If any variable is missing or has the wrong type, Lyn logs
`Missing environment variables: A, B` and exits the process with code 1.
Your server never starts with a broken configuration.

### Built-in

| Key   | Variable   | Type     | Required |
| ----- | ---------- | -------- | -------- |
| `env` | `NODE_ENV` | `string` | yes      |

### Declaring your own

Each entry maps a key of your choice to a variable name and a type:

```ts
const app = new Lyn({
  env: {
    port:        { name: "PORT",         type: "number" },
    databaseUrl: { name: "DATABASE_URL", type: "string" },
    debug:       { name: "DEBUG",        type: "boolean" },
  },
});
```

| `type`      | Accepted values                     | Parsed to |
| ----------- | ----------------------------------- | --------- |
| `"string"`  | any defined value                   | `string`  |
| `"number"`  | anything `Number()` can convert     | `number`  |
| `"boolean"` | `true`, `false`, `1`, `0`           | `boolean` |

All declared variables are required. Bun loads `.env`, `.env.local` and
`.env.<NODE_ENV>` automatically, so you can keep them in a `.env` file
(already git-ignored).

### Reading the values

Parsed values are available on `app.envConfig`:

```ts
app.envConfig.env;  // value of NODE_ENV

const { port, databaseUrl } = app.envConfig as unknown as {
  port: number;
  databaseUrl: string;
};
```

Your own keys are present at runtime, but `envConfig` is only typed with the
built-in `env` key for now, hence the cast.

## CORS

CORS is **disabled by default**: Lyn sends no CORS header, so only pages
served from the same origin as the API can call it from a browser. Enable
it with the `cors` option:

```ts
new Lyn({
  cors: {
    origin: ["https://app.example.com"],
    credentials: true,
    exposedHeaders: ["X-Total-Count"],
  },
});
```

| Option           | Type                                       | Default                      |
| ---------------- | ------------------------------------------ | ---------------------------- |
| `origin`         | `"*"` \| `string[]` \| `(origin) => boolean` | required                     |
| `credentials`    | `boolean`                                  | `false`                      |
| `allowedHeaders` | `string[]`                                 | the headers the browser asks for |
| `exposedHeaders` | `string[]`                                 | `[]`                         |
| `maxAge`         | `number` (seconds)                         | `600`                        |

- `origin` — `"*"` allows every origin. A list allows exact matches only
  (`"https://app.example.com"`, scheme and port included). A function
  decides per request, e.g. `(origin) => origin.endsWith(".example.com")`.
- `credentials` — lets the browser send cookies and `Authorization`.
  Combining it with `origin: "*"` is forbidden by the CORS spec, so Lyn
  throws at startup.
- Every response — successes and errors, including 404, 405 and 500 — gets
  `Access-Control-Allow-Origin` when the request's `Origin` is allowed.
- Preflight requests (`OPTIONS` with `Access-Control-Request-Method`) are
  answered automatically with `204`, the methods registered for the path,
  the allowed headers and `Access-Control-Max-Age`.
- A request from a refused origin is still processed, but gets no CORS
  header, so the browser hides the response from the page. CORS protects
  users' browsers, not your server: keep real authorization in your handlers.
- With a list or a function, responses carry `Vary: Origin` so caches don't
  serve one origin's response to another.

## Logging

Lyn uses [pino](https://getpino.io) with `pino-pretty`.

- **Internal logs** (prefixed `[Lyn]`): startup, every request
  (`Handle request: GET on /users`), every response status, every error.
  They are disabled when `NODE_ENV=lyn-test`.
- **Your logs**: use the exported `logger`.

```ts
import { logger } from "lyn";

.post("/orders", ({ body }) => {
  logger.info({ orderId: body.id }, "order received");
  return { ok: true };
})
```

## Limitations

- No optional variables or default values for env entries.
- `envConfig` is not typed with your custom keys.
- Log level and transport are not configurable.
- A `lyn.config.ts` file is planned; configuration is constructor-only today.
