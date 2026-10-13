# Best practices

Lyn is made to ship fast, not to ship badly. It already handles a lot for
you: validation, errors that don't leak, request limits, and a query
builder that sends every value as a parameter. The rules below cover
the rest: what only your code can get right.

Every rule fits in one line:

| Rule | In one line |
| --- | --- |
| [Never return a database row](#never-return-a-database-row) | Map entities to DTOs, field by field |
| [Validate every input](#validate-every-input) | A schema on every body, param and query |
| [Never trust the client](#never-trust-the-client) | Who, how much and what is allowed come from the server |
| [Check access on every route](#check-access-on-every-route) | Filter by owner in the query itself |
| [Keep errors boring](#keep-errors-boring) | Stable codes, no internals |
| [Let Postgres guard your data](#let-postgres-guard-your-data) | Constraints and transactions |
| [Keep secrets secret](#keep-secrets-secret) | Environment variables, never logs |

## Never return a database row

A row is your **storage**: it holds password hashes, internal flags,
emails, tokens. A response is a **contract** with your clients. Keep them
apart with a mapper, a function that builds the response from the row,
field by field:

```ts
// src/db/schema.ts
export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(),
  displayName: text().notNull(),
  passwordHash: text().notNull(),
  isAdmin: boolean().notNull().default(false),
  createdAt: timestamp().notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
```

```ts
// src/dto/user.ts
import type { User } from "../db/schema";

export const toPublicUser = (user: User) => ({
  id: user.id,
  displayName: user.displayName,
  memberSince: user.createdAt.toISOString(),
});

export type PublicUser = ReturnType<typeof toPublicUser>;
```

```ts
// ❌ sends passwordHash, isAdmin and every column added later
.get("/users/:id", ({ db, params }) =>
  db.query.users.findFirst({ where: eq(users.id, params.id) }),
  { params: z.object({ id: z.string().uuid() }) }
)

// ✅ sends what the client needs, nothing else
.get(
  "/users/:id",
  async ({ db, params }) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, params.id) });
    if (!user) throw notFound("User not found");
    return toPublicUser(user);
  },
  { params: z.object({ id: z.string().uuid() }) }
)
```

Why a mapper rather than spreading the row and deleting fields:

- **New columns stay private by default.** Add `resetToken` to the table
  and it is not sent until you add it to the mapper on purpose.
- **Your API doesn't change with your tables.** Rename a column, the
  response stays the same.
- **One place to read.** "What do we expose about a user?" has one
  answer: `src/dto/user.ts`.

Write one mapper per audience when they differ: `toPublicUser` for
everyone, `toAccountUser` for the user themselves, with their email.

::: tip Select less, too
Selecting only the columns you need (`columns: { id: true, … }`) makes
the query lighter, see [Performance](performance.md#select-only-the-columns-you-send).
It doesn't replace the mapper: the mapper is what guarantees the shape of
the response.
:::

## Validate every input

Everything in a request is controlled by whoever sends it. Give every
route a schema for each input it reads:

```ts
.post(
  "/posts",
  ({ body }) => createPost(body),
  {
    body: z.object({
      title: z.string().trim().min(3).max(120),
      content: z.string().max(10_000),
      tags: z.array(z.string().max(30)).max(10),
    }),
  }
)
```

- **Bound everything.** A string without `.max()` or an array without
  `.max()` lets a client send megabytes into your database. Lyn also caps
  the whole body with [`server.maxBodyBytes`](../essentials/server.md#limits).
- **Use precise types.** `z.email()`, `z.string().uuid()`,
  `z.number().int().positive()`, `z.enum([...])` in bodies: the narrower
  the schema, the fewer surprises in your handler.
- **Unknown keys are dropped.** `body` only holds the keys of your
  schema, so `{ "isAdmin": true }` sent by a client never reaches your
  insert. Don't add fields the client must not set, such as `isAdmin`,
  `ownerId` or `price`, to the schema.
- **Headers and cookies are not validated by Lyn.** Parse the ones you
  read with a Zod schema yourself.

`body`, `params` and `query` don't exist without a schema, so TypeScript
reminds you. Reading `request` directly bypasses validation: avoid it for
user data. See [Validation](../essentials/validation.md).

## Never trust the client

A validated value is well-formed, not true. The client can send any
value that passes the schema. Decide on the server:

| Never take from the client | Take it from |
| --- | --- |
| Who the user is (`userId` in the body) | The session or token, checked on the server |
| A price, a total, a discount | Your database |
| A role or a permission | Your database |
| A status change (`"paid"`) | The event that proves it, such as a payment webhook |
| Its IP address (`X-Forwarded-For`) | Your proxy, see [Rate limiting](../configuration/rate-limiting.md#identifying-clients) |

```ts
// ❌ the client sets the total
.post("/orders", ({ db, body }) =>
  db.insert(orders).values({ productId: body.productId, total: body.total }),
  { body: z.object({ productId: z.string().uuid(), total: z.number() }) }
)

// ✅ the server computes it
.post(
  "/orders",
  async ({ db, body }) => {
    const product = await db.query.products.findFirst({
      where: eq(products.id, body.productId),
    });
    if (!product) throw notFound("Product not found");
    const [order] = await db
      .insert(orders)
      .values({ productId: product.id, total: product.price * body.quantity })
      .returning();
    return toOrderDto(order!);
  },
  {
    body: z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().min(1).max(100),
    }),
  }
)
```

The same goes for the browser: [CORS](../configuration/cors.md) and
frontend checks protect your users, not your API. Anyone can call it with
`curl`.

## Check access on every route

Knowing who the user is doesn't say what they may touch. Check ownership
**in the query**, so a forgotten `if` can't leak another user's data:

```ts
// ❌ any logged-in user can read any invoice by guessing its id
db.query.invoices.findFirst({ where: eq(invoices.id, params.id) });

// ✅ only the owner's invoice can match
db.query.invoices.findFirst({
  where: and(eq(invoices.id, params.id), eq(invoices.ownerId, currentUserId)),
});
```

Answer `404`, not `403`, when the record belongs to someone else: a
`403` confirms that the id exists.

::: info Authentication
Lyn doesn't ship authentication yet: it is
[next on the roadmap](https://github.com/Rouret/lyn#roadmap). Until then, `currentUserId`
comes from your own session or token check.
:::

## Keep errors boring

- **Throw your own errors** with a stable `code` your clients can test,
  such as `POST_NOT_FOUND` or `ALREADY_VOTED`. See
  [Sending your own errors](../essentials/errors.md#sending-your-own-errors).
- **Messages are for humans, not for debugging.** Never put SQL, stack
  traces, file paths or other users' data in them. Lyn already answers a
  generic `500` for unexpected errors and logs the details on the server.
- **Same answer for "wrong email" and "wrong password"**, so a login form
  can't be used to find which emails have an account.

## Let Postgres guard your data

Your schema is the last line of defence, and it holds even when two
requests race:

- **Constraints**: `.notNull()`, `.unique()`, `.references()`. Lyn turns
  their violations into `409` and `400`, see
  [Database errors](../integrations/database.md#database-errors).
- **Transactions** for writes that must happen together.
- **Atomic updates**: `` set({ stock: sql`${products.stock} - 1` }) ``
  rather than read, compute, write.
- **Never build SQL from strings.** The query builder and the `sql`
  template send values as parameters. `sql.raw()` doesn't: never pass it
  user input.

```ts
sql`select * from users where email = ${body.email}`  // ✅ parameter
sql.raw(`select * from users where email = '${body.email}'`)  // ❌ injection
```

## Keep secrets secret

- Secrets live in [environment variables](../configuration/environment-variables.md),
  never in the code or the Docker image. `.env` files stay out of Git.
- Never log a body, a token or a password. Lyn's own logs never include
  bodies, query strings, SQL parameters or error messages.
- Never put a token in a path, such as `/reset/:token`: the path is in
  every request log line, and in your proxy's logs. Send it in the body
  or a header.
- In production, `NODE_ENV=production` and the
  [production checklist](production.md#checklist).

## Before you ship

- [ ] Every route returns a DTO, never a row
- [ ] Every body, param and query has a schema, with bounded strings and arrays
- [ ] User ids, prices and roles come from the server
- [ ] Queries on private data filter by owner
- [ ] Custom errors have stable codes and no internals
- [ ] Unique and foreign key constraints exist in the schema
- [ ] Secrets are in environment variables
- [ ] Rate limiting is on, keyed on your proxy's header
- [ ] The [production checklist](production.md#checklist) is done
