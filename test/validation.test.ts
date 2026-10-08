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

describe("Body parsing", () => {
  const userApp = () =>
    new Lyn(TEST_LYN_CONFIG).post("/users", ({ body }) => body, {
      body: z.object({ name: z.string() }),
    });

  const postRaw = (body: string | undefined, contentType?: string) =>
    userApp().handle(
      new Request("http://lyn.test/users", {
        method: "POST",
        body,
        headers: contentType ? { "Content-Type": contentType } : {},
      })
    );

  const errorCode = async (response: Response) =>
    ((await response.json()) as { code: string }).code;

  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON",
    "application/merge-patch+json",
  ])("accepts the %s content type", async (contentType) => {
    const response = await postRaw('{"name":"Ada"}', contentType);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: "Ada" });
  });

  it("returns 400 NO_BODY when the body is empty", async () => {
    const response = await postRaw("", "application/json");

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("NO_BODY");
  });

  it.each([
    ["text/plain", "text/plain"],
    ["a form", "application/x-www-form-urlencoded"],
    ["a lookalike", "application/jsonp"],
  ])(
    "returns 415 UNSUPPORTED_MEDIA_TYPE for %s",
    async (_, contentType) => {
      const response = await postRaw('{"name":"Ada"}', contentType);

      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({
        code: "UNSUPPORTED_MEDIA_TYPE",
        message: `Unsupported content type: ${contentType}, expected application/json`,
      });
    }
  );

  it("returns 415 when the content type header is missing", async () => {
    const request = new Request("http://lyn.test/users", {
      method: "POST",
      body: new Blob(['{"name":"Ada"}']),
    });

    const response = await userApp().handle(request);

    expect(response.status).toBe(415);
    expect(await errorCode(response)).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("returns 400 INVALID_JSON for a malformed body", async () => {
    const response = await postRaw('{"name":', "application/json");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "INVALID_JSON",
      message: "Request body is not valid JSON",
    });
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

  const postApp = () =>
    new Lyn(TEST_LYN_CONFIG).get(
      "/users/:userId/posts/:slug",
      ({ params }) => ({ params, userIdType: typeof params.userId }),
      {
        params: z.object({
          userId: z.number().int().positive(),
          slug: z.string(),
        }),
      }
    );

  const issuePaths = async (response: Response) =>
    ((await response.json()) as { cause: { path: string[] }[] }).cause.map(
      (issue) => issue.path.join(".")
    );

  it("converts numeric params to numbers", async () => {
    const response = await createTestClient(postApp()).get(
      "/users/42/posts/007"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      params: { userId: 42, slug: "007" },
      userIdType: "number",
    });
  });

  it("rejects a non-numeric value for a numeric param", async () => {
    const response = await createTestClient(postApp()).get(
      "/users/abc/posts/hello"
    );

    expect(response.status).toBe(400);
    expect(await issuePaths(response)).toEqual(["userId"]);
  });

  it.each(["4.5", "-4"])(
    "applies refinements on numeric params (userId=%s)",
    async (userId) => {
      const response = await createTestClient(postApp()).get(
        `/users/${userId}/posts/hello`
      );

      expect(response.status).toBe(400);
      expect(await issuePaths(response)).toEqual(["userId"]);
    }
  );
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
