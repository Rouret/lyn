import { Lyn } from "#/index";
import { afterEach, describe, expect, it } from "bun:test";
import { TESTING_PORT } from "testing/constants";
import { testFetch } from "testing/utilsTest";
import z from "zod";

let app: Lyn | null = null;

afterEach(async () => {
  await app?.stop();
  app = null;
});

describe("Content type", () => {
  it("should return application/json for JSON response", async () => {
    app = new Lyn()
      .get("/json", () => {
        return { message: "Hello World" };
      })
      .get("/text", () => {
        return "Hello World";
      })
      .listen(TESTING_PORT);

    const response = await testFetch.get("/json");
    expect(response.headers.get("content-type")).toBe("application/json");

    const response2 = await testFetch.get("/text");
    expect(response2.headers.get("content-type")).toBe("text/plain");
  });
});

describe("Handle Error", () => {
  it("should return application/json for JSON response", async () => {
    app = new Lyn()
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
      .get("/error", () => {
        throw new Error("Test error");
      })
      .listen(TESTING_PORT);

    const response = await testFetch.post("/users");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("NO_BODY");

    const response2 = await testFetch.get("/error");
    expect(response2.status).toBe(500);
    expect(((await response2.json()) as { code: string }).code).toBe(
      "INTERNAL_SERVER_ERROR"
    );
  });
});

describe("Post's body validation", () => {
  it("send request and response to the client", async () => {
    app = new Lyn()
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
      .listen(TESTING_PORT);

    const response = await testFetch.post("/users", { name: "John" });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      message: "Hello John",
    });
  });

  it("send bad request", async () => {
    app = new Lyn()
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
      .listen(TESTING_PORT);

    const response = await testFetch.post("/users", { badKey: "John" });

    expect(response.status).toBe(400);
  });
});

describe("Params validation", () => {
  it("validate the params", async () => {
    app = new Lyn()
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
      .listen(TESTING_PORT);

    const response = await testFetch.get("/John");

    expect(await response.json()).toMatchObject({
      message: "Hello John",
    });
  });
});
