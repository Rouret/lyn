import { Lyn } from "#/index";
import { expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import z from "zod";

it("only exposes the context fields that have a schema", () => {
  new Lyn(TEST_LYN_CONFIG)
    .get("/no-schema", (context) => {
      // @ts-expect-error query is absent without a query schema
      context.query;
      // @ts-expect-error params are absent without a params schema
      context.params;
      // @ts-expect-error body is absent on GET
      context.body;
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
