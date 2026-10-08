# Environment variables

Lyn reads and checks your environment variables **once, in `new Lyn()`**.
If one is missing or invalid, the app doesn't start, so it can never run
with a broken configuration.

## Declaring variables

Each entry maps a key of your choice to a variable name and a type:

```ts
const app = new Lyn({
  env: {
    port:   { name: "PORT",    type: "number" },
    apiKey: { name: "API_KEY", type: "string" },
    debug:  { name: "DEBUG",   type: "boolean" },
  },
});
```

| `type` | Accepted values | You get |
| --- | --- | --- |
| `"string"` | any non-blank value | `string` |
| `"number"` | a number, spaces around it ignored (`" 42 "`, `-1.5`) | `number` |
| `"boolean"` | exactly `true`, `false`, `1` or `0` | `boolean` |

Every declared variable is required. A blank value (`PORT=`) counts as
missing, so it can't silently become `0` or `""`.

`NODE_ENV` is always required, in addition to your own variables.

::: tip .env files
Bun loads `.env`, `.env.local` and `.env.<NODE_ENV>` automatically. Keep
your values there.
:::

## Reading the values

The parsed values are on `app.env`, typed from your declaration:

```ts
app.env.port;     // number
app.env.debug;    // boolean
app.env.nodeEnv;  // string, the value of NODE_ENV
app.env.other;    // type error: not declared
```

## When something is wrong

`new Lyn()` throws a `LynEnvError` that lists every problem at once:

```
LynEnvError: Invalid environment variables:
  - API_KEY: missing
  - PORT: expected a number
```

The values themselves are never printed, since they may be secrets.

Left uncaught, the error stops the process. You can also catch it:

```ts
import { Lyn, LynEnvError } from "lyn";

try {
  new Lyn({ env: { port: { name: "PORT", type: "number" } } });
} catch (error) {
  if (error instanceof LynEnvError) reportToMonitoring(error.message);
  throw error;
}
```

::: info Not supported yet
- Optional variables and default values.
:::
