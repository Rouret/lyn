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
