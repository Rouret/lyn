# Production

Bun runs TypeScript directly, so there is **no build step**: in
production you install the dependencies and run `src/index.ts`. This page
packages that into a Docker image and runs it from CI.

## Checklist

| | Why |
| --- | --- |
| `NODE_ENV=production` | JSON logs, one object per line, for your log collector |
| `server.hostname: "0.0.0.0"` | The default, `127.0.0.1`, is unreachable from outside a container |
| `server.allowedHosts` | Your domain names, or every request gets `400 INVALID_HOST` |
| `DATABASE_URL` from a secret | Never in the image or the repository |
| Migrations applied before the new version starts | See [Migrations](#migrations) |
| Pool size × instances below Postgres' `max_connections` | See [Connection pool](../integrations/database.md#connection-pool) |
| Rate limit keyed on your proxy's header | See [Identifying clients](../configuration/rate-limiting.md#identifying-clients) |
| The best practices checklist is done | See [Before you ship](best-practices.md#before-you-ship) |

## The entry point

Keep the app in `src/app.ts` and start it in `src/index.ts` (see
[Project structure](../guide/project-structure.md)):

```ts
// src/index.ts
import { createApp } from "./app";

const app = createApp();
await app.listen(app.env.port);
```

```ts
// src/app.ts
import { Lyn } from "@rouret/lyn";
import * as schema from "./db/schema";

export const createApp = () =>
  new Lyn({
    env: { port: { name: "PORT", type: "number" } },
    database: { schema },
    server: {
      hostname: "0.0.0.0",
      allowedHosts: ["api.example.com"],
    },
  }).get("/health", () => "ok");
```

## Dockerfile

```dockerfile
# Dockerfile
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY src src
COPY drizzle drizzle
USER bun
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]
```

- The first stage installs the dependencies only, so Docker reuses that
  layer until `package.json` or `bun.lock` changes.
- `--production` skips the dev dependencies: `drizzle-kit` and your test
  tools stay out of the image. Applying migrations doesn't need them.
- `drizzle/` holds your migrations. Copy `lyn.config.ts` too if you
  [use one](../integrations/migrations.md#other-paths).
- `USER bun` runs the app without root.
- Pin an exact Bun version, such as `oven/bun:1.3.6`, for builds you can
  reproduce.

Keep secrets and local files out of the image with a `.dockerignore`:

```txt
# .dockerignore
node_modules
.env
.env.*
.git
test
```

## Build and run

```bash
docker build -t my-api .

docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e DATABASE_URL=postgres://user:password@db.example.com:5432/app \
  my-api
```

If a variable is missing or the database is unreachable, the container
exits at once with a [`LynEnvError`](../configuration/environment-variables.md#when-something-is-wrong)
or a [`LynDatabaseError`](../integrations/database.md#startup-and-shutdown):
the orchestrator sees the failure before any traffic is sent.

On `docker stop`, Lyn stops the server and closes the database pool
before the process exits.

## Migrations

Apply them with the same image, before starting the new version:

```bash
docker run --rm -e DATABASE_URL=… my-api bunx lyn db migrate
```

`lyn db migrate` only applies the files not applied yet, so it is safe to
run on every deploy. For a single instance, [`migrateOnStart`](../integrations/migrations.md#migrating-on-start)
does it from `listen()` instead.

## Health checks

The `/health` route above answers `200 ok` without touching the database.
Point your platform's probe at it.

::: warning Probes and `Host`
Some platforms send the container's IP as the `Host` of their health
probes (Kubernetes does). Add that header to the probe, or the name to
`server.allowedHosts`, or the probe gets `400 INVALID_HOST`.
:::

## GitHub Actions

Run the tests against a Postgres service, then push the image to the
GitHub Container Registry on `main`:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-retries 10
    env:
      NODE_ENV: test
      LOG_LEVEL: silent
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: bunx lyn db migrate
      - run: bun test

  image:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

## GitLab CI

The same pipeline, pushing to the project's GitLab registry:

```yaml
# .gitlab-ci.yml
stages: [test, build]

test:
  stage: test
  image: oven/bun:1
  services:
    - postgres:17-alpine
  variables:
    POSTGRES_PASSWORD: postgres
    NODE_ENV: test
    LOG_LEVEL: silent
    DATABASE_URL: postgres://postgres:postgres@postgres:5432/postgres
  script:
    - bun install --frozen-lockfile
    - bunx tsc --noEmit
    - bunx lyn db migrate
    - bun test

build:
  stage: build
  image: docker:27
  services:
    - docker:27-dind
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  script:
    - docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
```

In both pipelines, the deploy itself depends on your host. Run
`bunx lyn db migrate` with the production `DATABASE_URL` (a CI secret),
then roll out the new tag.
