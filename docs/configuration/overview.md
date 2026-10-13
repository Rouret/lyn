# Configuration

Everything is configured in one object, passed to `new Lyn()`. Every option
is optional: `new Lyn()` alone is a working app.

```ts
const app = new Lyn({
  env: {
    port: { name: "PORT", type: "number" },
  },
  database: { schema },
  cors: { origin: ["https://app.example.com"] },
  rateLimit: { max: 100 },
  server: { hostname: "0.0.0.0", allowedHosts: ["api.example.com"] },
});
```

## Application

| Option | What it does | Page |
| --- | --- | --- |
| `env` | Declares the environment variables your app needs, checked and typed at startup | [Environment variables](environment-variables.md) |
| `database` | Connects Postgres, with a typed `db` in every handler | [Database](../integrations/database.md) |

## Security

| Option | What it does | Page |
| --- | --- | --- |
| `cors` | Lets browsers on other domains call your API | [CORS](cors.md) |
| `rateLimit` | Limits how many requests each client may send | [Rate limiting](rate-limiting.md) |

## Server

| Option | Default | Page |
| --- | --- | --- |
| `server.hostname` | `"127.0.0.1"`, this machine only | [Who can reach it](../essentials/server.md#who-can-reach-it) |
| `server.allowedHosts` | `127.0.0.1`, `localhost`, `::1` | [Who can reach it](../essentials/server.md#who-can-reach-it) |
| `server.maxBodyBytes` | `1048576` (1 MiB) | [Limits](../essentials/server.md#limits) |
| `server.requestTimeoutMs` | `30000` (30 seconds) | [Limits](../essentials/server.md#limits) |
| `start.hideLynLogo` | `false` | [Starting](../essentials/server.md#starting) |

## Outside the constructor

- **Logging** is configured with the `NODE_ENV` and `LOG_LEVEL` environment
  variables. See [Logging](logging.md).
- **`lyn.config.ts`** only tells the `lyn db` commands where your schema
  and migrations are. See [Migrations](../integrations/migrations.md#other-paths).
