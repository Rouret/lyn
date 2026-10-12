import { Lyn } from "#lyn/index";
import { expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import z from "zod";
import * as databaseSchema from "test/fixtures/schema";

it("only exposes the context fields that have a schema", () => {
  new Lyn(TEST_LYN_CONFIG)
    .get("/no-schema", (context) => {
      // @ts-expect-error query is absent without a query schema
      context.query;
      // @ts-expect-error params are absent without a params schema
      context.params;
      // @ts-expect-error body is absent on GET
      context.body;
      context.signal satisfies AbortSignal;
      return "ok";
    })
    .post(
      "/users/:id",
      ({ body, params, query }) => {
        const name: string = body.name;
        const id: number = params.id;
        const page: number | undefined = query.page;
        return { name, id, page };
      },
      {
        body: z.object({ name: z.string() }),
        params: z.object({ id: z.number() }),
        query: z.object({ page: z.number().optional() }),
      }
    );

  expect(true).toBe(true);
});

it("types app.env from the env config", () => {
  const previousValues = { PORT: Bun.env.PORT, DEBUG: Bun.env.DEBUG };
  Bun.env.PORT = "3000";
  Bun.env.DEBUG = "1";

  try {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      env: {
        port: { name: "PORT", type: "number" },
        debug: { name: "DEBUG", type: "boolean" },
      },
    });

    const port: number = app.env.port;
    const debug: boolean = app.env.debug;
    const nodeEnv: string = app.env.nodeEnv;
    // @ts-expect-error undeclared variables are not on app.env
    app.env.databaseUrl;
    // @ts-expect-error a number variable is not a string
    app.env.port satisfies string;

    expect({ port, debug, nodeEnv: typeof nodeEnv }).toEqual({
      port: 3000,
      debug: true,
      nodeEnv: "string",
    });
  } finally {
    for (const [name, value] of Object.entries(previousValues)) {
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
  }
});

it("types ctx.db and app.db from the database schema", () => {
  Bun.env.LYN_TEST_TYPES_PG_URL = "postgres://lyn:lyn@127.0.0.1:1/lyn";
  try {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      env: { postgresUrl: { name: "LYN_TEST_TYPES_PG_URL", type: "string" } },
      database: {
        schema: databaseSchema,
        url: (env) => {
          env.postgresUrl satisfies string;
          // @ts-expect-error undeclared variables are not passed to url
          env.databaseUrl;
          return "postgres://lyn:lyn@127.0.0.1:1/lyn";
        },
      },
    }).get("/users", async ({ db }) => {
      const users = await db.query.users.findMany();
      users[0]?.email satisfies string | undefined;
      users[0]?.displayName satisfies string | null | undefined;
      // @ts-expect-error unknown columns are type errors
      users[0]?.password;
      // @ts-expect-error unknown tables are type errors
      db.query.posts;
      return users;
    });

    app.db.select().from(databaseSchema.users) satisfies Promise<unknown[]>;
    expect(app).toBeDefined();
  } finally {
    delete Bun.env.LYN_TEST_TYPES_PG_URL;
  }
});

it("leaves db out of apps without a database", () => {
  const app = new Lyn(TEST_LYN_CONFIG).get("/", (context) => {
    // @ts-expect-error db is absent without a database
    context.db;
    return "ok";
  });

  expect(() => {
    // @ts-expect-error app.db is unusable without a database
    app.db.select();
  }).toThrow();
});
