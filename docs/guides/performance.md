# Performance

Lyn's own work per request is around a microsecond. In a real app, the
time goes to your database queries and the services you call. This page
starts with how to measure, then lists the changes that pay off, biggest
first.

## Measure first

Every request log line has its `durationMs`, from the first byte Lyn sees
to the response:

```json
{"method":"GET","path":"/boards/feature-requests","status":200,"durationMs":3.41,"msg":"[Lyn] GET /boards/feature-requests 200 3.41ms"}
```

To find which query is slow, turn on [query logs](../integrations/database.md#query-logs)
for a while: each query is logged with the request id of its request.

For load tests, run the app the way production does, with
`NODE_ENV=production`, then use a load tester such as
[oha](https://github.com/hatoo/oha):

```bash
NODE_ENV=production bun run src/index.ts
oha -z 10s -c 50 http://127.0.0.1:3000/boards/feature-requests
```

::: tip Benchmark in production mode
Outside `production`, logs are pretty-printed with colors, which is much
slower than JSON. A benchmark in development mode mostly measures the
log formatting.
:::

## Database

### Fetch related rows in one query

A loop that queries for each row runs N + 1 queries:

```ts
// ❌ one query per board
const boards = await db.query.boards.findMany();
for (const board of boards) {
  board.posts = await db.query.posts.findMany({
    where: eq(posts.boardId, board.id),
  });
}
```

Declare the relations in your schema and ask for them with `with`:
Drizzle fetches everything in a single query.

```ts
// ✅ one query
const boards = await db.query.boards.findMany({
  with: { posts: true },
});
```

### Select only the columns you send

```ts
db.query.posts.findMany({
  columns: { id: true, title: true, voteCount: true },
});
```

Less data read and less data sent. To control what the client receives,
map the rows to DTOs: see
[Best practices](best-practices.md#never-return-a-database-row).

### Paginate

Never return a whole table. Add `limit`, and fetch one row more than the
page to know if there is a next one:

```ts
const PAGE_SIZE = 20;

.get(
  "/posts",
  async ({ db, query }) => {
    const page = query.page ?? 1;
    const rows = await db.query.posts.findMany({
      orderBy: desc(posts.createdAt),
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
    });
    return { posts: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
  },
  { query: z.object({ page: z.number().int().positive().optional() }) }
)
```

### Index what you filter and sort on

Postgres indexes primary keys and `unique()` columns. Add an index for the
other columns of your `where` and `orderBy`:

```ts
import { index, integer, pgTable, uuid } from "@rouret/lyn/db";

export const posts = pgTable(
  "posts",
  {
    id: uuid().primaryKey().defaultRandom(),
    boardId: uuid().notNull(),
    voteCount: integer().notNull().default(0),
  },
  (table) => [index().on(table.boardId, table.voteCount)]
);
```

Then `bunx lyn db generate` writes the migration that creates it.

### Write in one round trip

Let Postgres compute the new value, and get the row back with
`returning()`, instead of reading it first:

```ts
// ❌ two queries, and two concurrent votes can lose one
const post = await db.query.posts.findFirst({ where: eq(posts.id, id) });
await db.update(posts).set({ voteCount: post!.voteCount + 1 }).where(eq(posts.id, id));

// ✅ one query, always correct
const [post] = await db
  .update(posts)
  .set({ voteCount: sql`${posts.voteCount} + 1` })
  .where(eq(posts.id, id))
  .returning({ id: posts.id, voteCount: posts.voteCount });
```

### Run independent queries together

Two queries that don't depend on each other can run at the same time,
each on its own pooled connection:

```ts
const [latest, total] = await Promise.all([
  db.query.posts.findMany({ orderBy: desc(posts.createdAt), limit: 20 }),
  db.$count(posts),
]);
```

### Keep transactions short

A transaction holds a connection until it ends. Never `fetch` another
service or wait on anything slow inside one: do it before, then open the
transaction.

### Size the pool

The pool has 10 connections by default. When every connection is busy,
the next query waits for one. Raise `max` for an instance under heavy
load, and keep `max` × your number of instances below the
`max_connections` of your Postgres server. See
[Connection pool](../integrations/database.md#connection-pool).

### Fail fast

A query stuck behind a lock holds its connection until the
[statement timeout](../integrations/database.md#statement-timeout), 30
seconds by default. Lower it so the pool frees up sooner:

```ts
new Lyn({ database: { schema, statementTimeoutMs: 5000 } });
```

## Logs

| Setting | Effect |
| --- | --- |
| `NODE_ENV=production` | JSON output, the fastest. Always set it in production |
| `logQueries: false` | The default. Turn it on to investigate, not permanently: it writes one line per query |
| `LOG_LEVEL=warn` | Drops the line of every successful request; `4xx` and `5xx` are still logged. Only if you get request logs elsewhere, such as from your proxy |

## Handlers

These are small savings: reach for them on routes that answer without the
database, such as a health check or a cached value.

**Don't make a handler `async` when it awaits nothing.** A synchronous
handler is answered without creating a promise or arming the request
timeout:

```ts
.get("/health", () => "ok")             // ✅
.get("/health", async () => "ok")       // works, slightly more work
```

**Only read what you use.** `signal` and `set.headers` are created the
first time you read them. Touch them only when you need them:

```ts
.get("/weather", async ({ signal }) => {
  const response = await fetch(WEATHER_URL, { signal });
  return response.json();
})
```

**Static paths are found fastest.** A path without `:param` or `*` is
looked up directly; the others walk the route tree. Both are fast:
design your URLs for your users, not for the router.

## Validation

Lyn only does the work you ask for: without a body schema the body is
never read, and without a query schema the query string is never parsed.

- Lower `server.maxBodyBytes` if your bodies are small: a large body is
  rejected before it is read or parsed.
- Keep refinements cheap: a `.refine()` runs on every request. Checks
  that need the database belong in the handler, where you have `db`.

## Rate limiting

`key` and `skip` run on every request, before routing. Keep them cheap: a
`skip` that queries the database adds a query to each request, including
the ones it lets through. Cache the answer, or check it in the handler.

## Scaling out

One Bun process uses one CPU core. To use more, run several instances
behind a load balancer. Remember that:

- each instance has its own [database pool](../integrations/database.md#connection-pool),
- each instance counts its own [rate limits](../configuration/rate-limiting.md#how-it-behaves),
- migrations run once, from your [deploy pipeline](production.md#migrations).
