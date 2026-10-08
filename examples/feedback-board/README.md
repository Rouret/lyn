# Feedback board

A small product-feedback API built with Lyn: a product has a board, people
post ideas and vote for them, and a widget embedded on the product's website
reads the board.

It exercises what Lyn gives you out of the box:

- **Postgres built in** — the schema in `src/db/schema.ts` is passed to
  `new Lyn({ database: { schema } })`; handlers get a typed Drizzle `db`.
- **Validation and typing** — params, query and body are validated with Zod
  and typed in each handler.
- **Transactions under load** — a vote inserts a row and increments a counter
  atomically; 50 concurrent votes are counted exactly.
- **Errors as HTTP responses** — unknown board → `404`, second vote from the
  same email → `409`, invalid input → `400`.
- **CORS for the widget** — only the origins in `ALLOWED_ORIGINS` can read
  the API from a browser.
- **Private by default** — authors' emails are stored but never returned by
  the public API (`src/db/public-columns.ts`).
- **Tests without a server** — every route is tested through `app.handle()`
  against a real Postgres.

## Run it

Lyn isn't on npm yet: the example installs the package packed from this
repository (`lyn.tgz`, not committed). Run `bun run pack:example` from the
repository root again after any change to Lyn.

```bash
docker compose up -d postgres   # Postgres on localhost:5433
cp .env.example .env
(cd ../.. && bun install && bun run pack:example)   # build Lyn, install it here
bun run db:migrate     # create the tables
bun run seed           # create the "acme" demo board
bun run dev            # http://localhost:3000
```

## API

| Method | Path | Body / query | Response |
| ------ | ---- | ------------ | -------- |
| `GET` | `/boards/:slug` | — | the board and its post count per status |
| `GET` | `/boards/:slug/posts` | `?sort=top\|new&status=…&page=1` | `{ posts, page, hasMore }`, 20 per page |
| `POST` | `/boards/:slug/posts` | `{ title, description?, authorEmail }` | `201` the created post |
| `GET` | `/posts/:id` | — | the post and its board |
| `POST` | `/posts/:id/votes` | `{ voterEmail }` | `201 { id, voteCount }`, `409` if already voted |
| `DELETE` | `/posts/:id/votes` | `?voterEmail=…` | `204`, `404` if there was no vote |

Statuses: `open`, `planned`, `in_progress`, `done`, `declined`.

```bash
curl localhost:3000/boards/acme
curl "localhost:3000/boards/acme/posts?sort=top&status=planned"
curl -X POST localhost:3000/boards/acme/posts \
  -H "Content-Type: application/json" \
  -d '{"title":"Zapier integration","authorEmail":"ada@example.com"}'
```

Voters are identified by the email they send; it isn't verified.

## Project layout

```
src/
  app.ts            createApp(): Lyn config + routes, shared by the server, scripts and tests
  index.ts          starts the server
  db/schema.ts      tables, enum and relations
  db/public-columns.ts  columns safe to return publicly
  routes/boards.ts  board and post listing routes
  routes/posts.ts   post detail and votes
  errors.ts         HTTP error helpers
  seed.ts           demo data
scripts/
  seed.ts           creates the demo board
drizzle/            SQL migrations (`bun run db:generate`, applied by `bun run db:migrate`)
test/               API tests through app.handle()
```

## Tests

```bash
bun run test
```

It starts a disposable Postgres (`postgres-test`, port 5434, in memory) and
runs the API tests against it.

After changing the schema, generate a migration with `bun run db:generate`.
