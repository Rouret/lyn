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
