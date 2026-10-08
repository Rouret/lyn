import { eq, sql } from "#/db";
import { LynDatabaseError, LynEnvError } from "#/index";
import { Lyn, z } from "#/index";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import * as schema from "test/fixtures/schema";
import { CREATE_POSTS_TABLE, CREATE_USERS_TABLE } from "test/fixtures/sql";

const TEST_DATABASE_URL = Bun.env.TEST_DATABASE_URL;
const UNREACHABLE_DATABASE_URL = "postgres://lyn:lyn@127.0.0.1:1/lyn";

const withDatabaseUrl = (value: string | undefined, run: () => void) => {
  const previous = Bun.env.DATABASE_URL;
  if (value === undefined) delete Bun.env.DATABASE_URL;
  else Bun.env.DATABASE_URL = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete Bun.env.DATABASE_URL;
    else Bun.env.DATABASE_URL = previous;
  }
};

describe("database configuration", () => {
  it("requires DATABASE_URL when no url is given", () => {
    withDatabaseUrl(undefined, () => {
      expect(() => new Lyn({ ...TEST_LYN_CONFIG, database: { schema } })).toThrow(
        new LynEnvError(["DATABASE_URL: missing"])
      );
    });
  });

  it("reports DATABASE_URL together with the other invalid variables", () => {
    withDatabaseUrl(undefined, () => {
      expect(
        () =>
          new Lyn({
            ...TEST_LYN_CONFIG,
            env: { port: { name: "LYN_TEST_MISSING_PORT", type: "number" } },
            database: { schema },
          })
      ).toThrow(
        new LynEnvError([
          "LYN_TEST_MISSING_PORT: missing",
          "DATABASE_URL: missing",
        ])
      );
    });
  });

  it("does not require DATABASE_URL when a url is given", () => {
    withDatabaseUrl(undefined, () => {
      expect(
        () =>
          new Lyn({
            ...TEST_LYN_CONFIG,
            database: { schema, url: UNREACHABLE_DATABASE_URL },
          })
      ).not.toThrow();
    });
  });

  it("does not require DATABASE_URL without a database", () => {
    withDatabaseUrl(undefined, () => {
      expect(() => new Lyn(TEST_LYN_CONFIG)).not.toThrow();
    });
  });

  it("passes the parsed env to a url function", () => {
    const previous = Bun.env.LYN_TEST_PG_URL;
    Bun.env.LYN_TEST_PG_URL = UNREACHABLE_DATABASE_URL;
    let receivedUrl: string | undefined;

    try {
      new Lyn({
        ...TEST_LYN_CONFIG,
        env: { postgresUrl: { name: "LYN_TEST_PG_URL", type: "string" } },
        database: {
          schema,
          url: (env) => {
            receivedUrl = env.postgresUrl;
            return env.postgresUrl;
          },
        },
      });
    } finally {
      if (previous === undefined) delete Bun.env.LYN_TEST_PG_URL;
      else Bun.env.LYN_TEST_PG_URL = previous;
    }

    expect(receivedUrl).toBe(UNREACHABLE_DATABASE_URL);
  });

  it("does not keep DATABASE_URL on app.env", () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      database: { schema, url: UNREACHABLE_DATABASE_URL },
    });

    expect(Object.keys(app.env)).toEqual(["nodeEnv"]);
  });

  it("throws when app.db is used without a database", () => {
    const app = new Lyn(TEST_LYN_CONFIG);

    expect(() => app.db).toThrow(
      "No database configured: pass `database: { schema }` to new Lyn() to use app.db"
    );
  });
});

describe("database startup", () => {
  it("refuses to listen when the database is unreachable", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      database: { schema, url: UNREACHABLE_DATABASE_URL },
    }).get("/", () => "ok");

    const listening = app.listen();

    await expect(listening).rejects.toThrow(LynDatabaseError);
    await expect(listening).rejects.toThrow(
      "Cannot connect to the database: Failed to connect"
    );
    expect(() => app.url).toThrow("Server is not running");
    await app.stop();
  });

  it("refuses to listen while the database check is running", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      database: { schema, url: UNREACHABLE_DATABASE_URL },
    });

    const first = app.listen();
    const second = app.listen();

    await expect(second).rejects.toThrow("Server is already starting.");
    await expect(first).rejects.toThrow(LynDatabaseError);
    await app.stop();
  });

  it("can retry listen after a failed database check", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      database: { schema, url: UNREACHABLE_DATABASE_URL },
    });

    await expect(app.listen()).rejects.toThrow(LynDatabaseError);
    await expect(app.listen()).rejects.toThrow(LynDatabaseError);
    await app.stop();
  });

  it("explains that a stopped app cannot reconnect", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      database: { schema, url: UNREACHABLE_DATABASE_URL },
    });

    await app.stop();

    await expect(app.listen()).rejects.toThrow(
      new LynDatabaseError(
        "The database connection was closed by stop(): create a new Lyn instance to connect again"
      )
    );
  });

  it("never includes the connection string in the error", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      database: { schema, url: "postgres://admin:s3cr3t@127.0.0.1:1/app" },
    });

    const error = await app.listen().catch((caught: Error) => caught);

    expect(String((error as Error).message)).not.toContain("s3cr3t");
    await app.stop();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("database (Postgres)", () => {
  const createApp = () =>
    new Lyn({
      ...TEST_LYN_CONFIG,
      database: { schema, url: TEST_DATABASE_URL! },
    })
      .get("/users", ({ db }) => db.query.users.findMany())
      .get(
        "/users/:id",
        ({ db, params }) =>
          db.query.users.findFirst({ where: eq(schema.users.id, params.id) }),
        { params: z.object({ id: z.string() }) }
      )
      .post(
        "/users",
        async ({ db, body }) => {
          const [user] = await db.insert(schema.users).values(body).returning();
          return user;
        },
        {
          body: z.object({
            email: z.email(),
            displayName: z.string().optional(),
          }),
        }
      );

  let app: ReturnType<typeof createApp>;

  const postUser = (body: object) =>
    app.handle(
      new Request("http://lyn.test/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );

  beforeAll(async () => {
    app = createApp();
    await app.db.execute(sql.raw("drop table if exists posts, users"));
    await app.db.execute(sql.raw(CREATE_USERS_TABLE));
  });

  beforeEach(async () => {
    await app.db.delete(schema.users);
  });

  afterAll(async () => {
    await app.db.execute(sql.raw("drop table if exists posts, users"));
    await app.stop();
  });

  it("creates and lists records through ctx.db", async () => {
    const created = await postUser({ email: "ada@example.com", displayName: "Ada" });
    const listed = await app.handle(new Request("http://lyn.test/users"));

    expect(created.status).toBe(201);
    const user = (await created.json()) as { id: string; displayName: string };
    expect(user.displayName).toBe("Ada");
    expect(await listed.json()).toEqual([
      expect.objectContaining({ id: user.id, email: "ada@example.com" }),
    ]);
  });

  it("maps camelCase keys to snake_case columns", async () => {
    await postUser({ email: "grace@example.com", displayName: "Grace" });

    const [row] = await app.db.execute<{ display_name: string }>(
      sql.raw("select display_name from users")
    );

    expect(row?.display_name).toBe("Grace");
  });

  it("exposes the same instance on app.db", async () => {
    await app.db.insert(schema.users).values({ email: "linus@example.com" });

    const response = await app.handle(new Request("http://lyn.test/users"));

    expect(await response.json()).toEqual([
      expect.objectContaining({ email: "linus@example.com" }),
    ]);
  });

  it("checks the connection and serves over HTTP", async () => {
    const server = createApp();
    await server.listen();

    try {
      const response = await fetch(`${server.url}/users`);
      expect(response.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it("closes the connection pool on stop", async () => {
    const stopped = createApp();
    await stopped.db.execute(sql`select 1`);

    await stopped.stop();

    const queryAfterStop = async () => stopped.db.execute(sql`select 1`);

    await expect(queryAfterStop()).rejects.toThrow();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("database errors (Postgres)", () => {
  const app = new Lyn({
    ...TEST_LYN_CONFIG,
    database: { schema, url: TEST_DATABASE_URL ?? UNREACHABLE_DATABASE_URL },
  })
    .post(
      "/users",
      ({ db, body }) => db.insert(schema.users).values(body).returning(),
      { body: z.object({ email: z.string() }) }
    )
    .post("/users/without-email", ({ db }) =>
      db.execute(sql`insert into users (email) values (null)`)
    )
    .get("/users/:id", ({ db, params }) =>
      db.select().from(schema.users).where(eq(schema.users.id, params.id)),
      { params: z.object({ id: z.string() }) }
    )
    .post("/users/:id/posts", ({ db, params }) =>
      db.execute(sql`insert into posts (author_id) values (${params.id})`),
      { params: z.object({ id: z.string() }) }
    )
    .get("/broken", ({ db }) => db.execute(sql`select * from missing_table`));

  const call = (method: string, path: string, body?: object) =>
    app.handle(
      new Request(`http://lyn.test${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body && JSON.stringify(body),
      })
    );

  beforeAll(async () => {
    await app.db.execute(sql.raw("drop table if exists posts, users"));
    await app.db.execute(sql.raw(CREATE_USERS_TABLE));
    await app.db.execute(sql.raw(CREATE_POSTS_TABLE));
  });

  afterAll(async () => {
    await app.db.execute(sql.raw("drop table if exists posts, users"));
    await app.stop();
  });

  it("answers 409 CONFLICT on a unique violation", async () => {
    await call("POST", "/users", { email: "ada@example.com" });

    const response = await call("POST", "/users", { email: "ada@example.com" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "CONFLICT",
      message: "A record with this value already exists",
    });
  });

  it("answers 409 CONFLICT on a foreign key violation", async () => {
    const response = await call(
      "POST",
      "/users/00000000-0000-0000-0000-000000000000/posts"
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      code: "CONFLICT",
      message: "This record conflicts with a related record",
    });
  });

  it("answers 400 VALIDATION on a not-null violation", async () => {
    const response = await call("POST", "/users/without-email");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "VALIDATION",
      message: "A required value is missing",
    });
  });

  it("answers 400 VALIDATION on a malformed value", async () => {
    const response = await call("GET", "/users/not-a-uuid");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "VALIDATION",
      message: "A value has an invalid format",
    });
  });

  it("answers 500 on any other database error", async () => {
    const response = await call("GET", "/broken");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
    });
  });

  it("never sends the table, constraint or values to the client", async () => {
    const response = await call("POST", "/users", { email: "ada@example.com" });

    const text = await response.text();
    expect(text).not.toContain("users");
    expect(text).not.toContain("ada@example.com");
  });
});
