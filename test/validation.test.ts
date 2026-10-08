import { Lyn } from "#/index";
import { describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { createTestClient } from "testing/utilsTest";

import z from "zod";


describe("Post's body validation", () => {
  it("send request and response to the client", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
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
      );
    const client = createTestClient(app);

    const response = await client.post("/users", { name: "John" });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      message: "Hello John",
    });
  });

  it("send bad request", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
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
      );
    const client = createTestClient(app);

    const response = await client.post("/users", { badKey: "John" });

    expect(response.status).toBe(400);
  });
});

describe("Params validation", () => {
  it("validate the params", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
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
      );
    const client = createTestClient(app);

    const response = await client.get("/John");

    expect(await response.json()).toMatchObject({
      message: "Hello John",
    });
  });
});

describe("Query validation", () => {
  it("validate the query", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
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
      );

    const client = createTestClient(app);

    const response = await client.get("/?name=John&isAdmin=true&age=20");

    expect(await response.json()).toMatchObject({
      name: "John",
      isAdmin: true,
      age: 20,
    });
  });

  const searchSchema = z.object({
    name: z.string().min(2),
    age: z.number().int(),
    isAdmin: z.boolean(),
    page: z.number().optional(),
    tag: z.string().optional(),
  });

  const searchApp = () =>
    new Lyn(TEST_LYN_CONFIG).get("/search", ({ query }) => query, {
      query: searchSchema,
    });

  const issuePaths = async (response: Response) =>
    ((await response.json()) as { cause: { path: string[] }[] }).cause.map(
      (issue) => issue.path.join(".")
    );

  it("parses optional fields when they are sent", async () => {
    const response = await createTestClient(searchApp()).get(
      "/search?name=Jo&age=3&isAdmin=0&page=2&tag=bun"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: "Jo",
      age: 3,
      isAdmin: false,
      page: 2,
      tag: "bun",
    });
  });

  it("leaves optional fields out when they are not sent", async () => {
    const response = await createTestClient(searchApp()).get(
      "/search?name=Jo&age=3&isAdmin=true"
    );

    expect(await response.json()).toEqual({
      name: "Jo",
      age: 3,
      isAdmin: true,
    });
  });

  it("rejects a missing required field", async () => {
    const response = await createTestClient(searchApp()).get(
      "/search?name=Jo&isAdmin=true"
    );

    expect(response.status).toBe(400);
    expect(await issuePaths(response)).toEqual(["age"]);
  });

  it("rejects values that are not of the declared type", async () => {
    const response = await createTestClient(searchApp()).get(
      "/search?name=Jo&age=abc&isAdmin=nope&page="
    );

    expect(response.status).toBe(400);
    expect(await issuePaths(response)).toEqual(["age", "isAdmin", "page"]);
  });

  it("applies schema refinements", async () => {
    const response = await createTestClient(searchApp()).get(
      "/search?name=J&age=3.5&isAdmin=true"
    );

    expect(response.status).toBe(400);
    expect(await issuePaths(response)).toEqual(["name", "age"]);
  });

  it("rejects a field sent several times", async () => {
    const response = await createTestClient(searchApp()).get(
      "/search?name=Jo&age=3&isAdmin=true&tag=a&tag=b"
    );

    expect(response.status).toBe(400);
    expect(await issuePaths(response)).toEqual(["tag"]);
  });

  it("ignores keys that are not in the schema", async () => {
    const response = await createTestClient(searchApp()).get(
      "/search?name=Jo&age=3&isAdmin=true&debug=1"
    );

    expect(await response.json()).toEqual({
      name: "Jo",
      age: 3,
      isAdmin: true,
    });
  });

  it("does not define optional fields that were not sent", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get(
      "/",
      ({ query }) => ({ hasPage: "page" in query }),
      { query: z.object({ name: z.string(), page: z.number().optional() }) }
    );

    const response = await createTestClient(app).get("/?name=Jo");

    expect(await response.json()).toEqual({ hasPage: false });
  });

  it("accepts an empty query when every field is optional", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ query }) => query, {
      query: z.object({ page: z.number().optional() }),
    });

    const response = await createTestClient(app).get("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
  });

  it("reports every missing required field when the query is empty", async () => {
    const response = await createTestClient(searchApp()).get("/search");

    expect(response.status).toBe(400);
    expect(await issuePaths(response)).toEqual(["name", "age", "isAdmin"]);
  });
});
