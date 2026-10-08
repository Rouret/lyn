# Configuration

Everything is configured in one object, passed to `new Lyn()`. Every option
is optional.

```ts
const app = new Lyn({
  env: {
    port: { name: "PORT", type: "number" },
  },
  cors: {
    origin: ["https://app.example.com"],
  },
  database: { schema },
  start: {
    hideLynLogo: true,
  },
});
```

| Option | What it does | Page |
| --- | --- | --- |
| `env` | Declares the environment variables your app needs, checked and typed at startup | [Environment variables](environment-variables.md) |
| `cors` | Lets browsers on other domains call your API | [CORS](cors.md) |
| `database` | Connects Postgres, with a typed `db` in every handler | [Database](../integrations/database.md) |
| `start.hideLynLogo` | Hides the logo printed by `listen()` (default `false`) | |

Logging is configured with environment variables: see [Logging](logging.md).

::: info Not supported yet
- A `lyn.config.ts` file. Configuration only goes through the constructor.
:::
