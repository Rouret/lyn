import { Lyn } from "#/index";
import { afterEach, describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { createTestClient } from "testing/utilsTest";

import z from "zod";

let app: Lyn | null = null;

afterEach(async () => {
  await app?.stop();
  app = null;
});

describe("Post's body validation", () => {
  it("send request and response to the client", async () => {
    app = new Lyn(TEST_LYN_CONFIG)
      .post(
        "/users",
        ({ body }) => {
          return {
            message: "Hello " + body.name,
          };
        },
        {
          body: z.object({
            name: z.string(),
          }),
        }
      )
      .listen();
    const client = createTestClient(app);

    const response = await client.post("/users", { name: "John" });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      message: "Hello John",
    });
  });

  it("send bad request", async () => {
    app = new Lyn(TEST_LYN_CONFIG)
      .post(
        "/users",
        ({ body }) => {
          return {
            message: "Hello " + body.name,
          };
        },
        {
          body: z.object({
            name: z.string(),
          }),
        }
      )
      .listen();
    const client = createTestClient(app);

    const response = await client.post("/users", { badKey: "John" });

    expect(response.status).toBe(400);
  });
});

describe("Params validation", () => {
  it("validate the params", async () => {
    app = new Lyn(TEST_LYN_CONFIG)
      .get(
        "/:name",
        ({ params }) => {
          return {
            message: "Hello " + params.name,
          };
        },
        {
          params: z.object({
            name: z.string(),
          }),
        }
      )
      .listen();
    const client = createTestClient(app);

    const response = await client.get("/John");

    expect(await response.json()).toMatchObject({
      message: "Hello John",
    });
  });
});

describe("Query validation", () => {
  it("validate the query", async () => {
    app = new Lyn(TEST_LYN_CONFIG)
      .get(
        "/",
        ({ query }) => {
          return query;
        },
        {
          query: z.object({
            name: z.string(),
            isAdmin: z.boolean(),
            age: z.number(),
          }),
        }
      )
      .listen();

    const client = createTestClient(app);

    const response = await client.get("/?name=John&isAdmin=true&age=20");

    expect(await response.json()).toMatchObject({
      name: "John",
      isAdmin: true,
      age: 20,
    });
  });
});
