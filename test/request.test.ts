import { Lyn } from "#/index";
import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { setupValidEnv } from "test/utilsTest";
import { createTestClient } from "testing/utilsTest";

import z from "zod";

let app: Lyn | null = null;

afterEach(async () => {
  await app?.stop();
  app = null;
});
beforeAll(() => {
  setupValidEnv();
});

describe("Content type", () => {
  it("should return application/json for JSON response", async () => {
    app = new Lyn(TEST_LYN_CONFIG)
      .get("/json", () => {
        return { message: "Hello World" };
      })
      .get("/text", () => {
        return "Hello World";
      })
      .listen();

    const client = createTestClient(app);

    const response = await client.get("/json");
    expect(response.headers.get("content-type")).toBe("application/json");

    const response2 = await client.get("/text");
    expect(response2.headers.get("content-type")).toBe("text/plain");
  });
});

describe("Handle Error", () => {
  it("should return application/json for JSON response", async () => {
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
      .get("/error", () => {
        throw new Error("Test error");
      })
      .listen();
    const client = createTestClient(app);
    const response = await client.post("/users");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("NO_BODY");

    const response2 = await client.get("/error");
    expect(response2.status).toBe(500);
    expect(((await response2.json()) as { code: string }).code).toBe(
      "INTERNAL_SERVER_ERROR"
    );
  });
});
