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
});
```

| Option | What it does | Page |
| --- | --- | --- |
| `env` | Declares the environment variables your app needs, checked and typed at startup | [Environment variables](environment-variables.md) |
| `cors` | Lets browsers on other domains call your API | [CORS](cors.md) |
| `rateLimit` | Limits how many requests each client may send | [Rate limiting](rate-limiting.md) |
| `database` | Connects Postgres, with a typed `db` in every handler | [Database](../integrations/database.md) |
| `start.hideLynLogo` | Hides the logo printed by `listen()` (default `false`) | |
| `server.hostname` | Interface `listen()` binds. Default `127.0.0.1` (this machine only). `"0.0.0.0"` opens it to the network | [Routing](../essentials/routing.md#starting-and-stopping) |
| `server.allowedHosts` | Hostnames accepted in `Host` while serving. Default: loopback names | [Routing](../essentials/routing.md#starting-and-stopping) |
| `server.maxBodyBytes` | Maximum JSON body size in bytes. Default 1 MiB. Larger bodies are rejected before parsing | [Validation](../essentials/validation.md#body) |
| `server.requestTimeoutMs` | Maximum request time in milliseconds. Default 30 seconds | [Handlers](../essentials/handlers.md#returning-a-response) |

Logging is configured with environment variables: see [Logging](logging.md).

::: info Not supported yet
- A `lyn.config.ts` file. Configuration only goes through the constructor.
:::
