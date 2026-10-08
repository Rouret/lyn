import { Lyn } from "#/index";
import { describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { createTestClient } from "testing/utilsTest";

import z from "zod";

describe("Content type", () => {
  it("should return application/json for JSON response", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/json", () => {
        return { message: "Hello World" };
      })
      .get("/text", () => {
        return "Hello World";
      });

    const client = createTestClient(app);

    const response = await client.get("/json");
    expect(response.headers.get("content-type")).toBe("application/json");

    const response2 = await client.get("/text");
    expect(response2.headers.get("content-type")).toBe("text/plain");
  });
});

describe("Handle Error", () => {
  it("should return application/json for JSON response", async () => {
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
      )
      .get("/error", () => {
        throw new Error("Test error");
      });
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

describe("Non-Error throws", () => {
  const thrownValues: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "secret detail"],
    ["a number", 42],
    ["an object with a truthy non-boolean isLynError", { isLynError: "yes" }],
  ];

  it.each(thrownValues)(
    "returns a generic 500 when the handler throws %s",
    async (_, thrownValue) => {
      const app = new Lyn(TEST_LYN_CONFIG).get("/", () => {
        throw thrownValue;
      });

      const response = await createTestClient(app).get("/");

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
      });
    }
  );

  it("still honours a duck-typed Lyn error", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => {
      throw Object.assign(new Error("User not found"), {
        isLynError: true,
        code: "NOT_FOUND",
        status: 404,
      });
    });

    const response = await createTestClient(app).get("/");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "NOT_FOUND",
      message: "User not found",
    });
  });
});

describe("Handler without a return value", () => {
  it("answers with an empty body and the default status", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => {});

    const response = await createTestClient(app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.text()).toBe("");
  });

  it("keeps the status set by the handler", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).post("/jobs", async ({ set }) => {
      set.status = 202;
      set.headers.set("Location", "/jobs/1");
    });

    const response = await createTestClient(app).post("/jobs");

    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe("/jobs/1");
    expect(await response.text()).toBe("");
  });

  it("still serialises null as JSON", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => null);

    const response = await createTestClient(app).get("/");

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.text()).toBe("null");
  });
});
