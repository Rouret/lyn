import { Lyn } from "#lyn/index";
import { describe, expect, it, test } from "bun:test";
import z from "zod";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { createTestClient } from "testing/utilsTest";

test("set", async () => {
  const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
    set.status = 201;
    set.headers.set("X-Custom-Header", "custom-value");
    return {
      message: "Hello World",
    };
  });

  const response = await createTestClient(app).get("/");

  expect(response.status).toBe(201);
  expect(response.headers.get("x-custom-header")).toBe("custom-value");
});

describe("set.headers", () => {
  const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it.each([
    ["an object", () => ({ ok: true }), "application/json"],
    ["a string", () => "ok", "text/plain; charset=utf-8"],
    ["an async object", async () => ({ ok: true }), "application/json"],
  ])(
    "gives a handler that never reads it the default headers (%s)",
    async (_, handler, contentType) => {
      const app = new Lyn(TEST_LYN_CONFIG).get("/", handler);

      const response = await app.handle(new Request("http://lyn.test/"));

      expect(response.headers.get("Content-Type")).toBe(contentType);
      expect(response.headers.get("X-Request-Id")).toMatch(UUID_PATTERN);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  );

  it("sends no Content-Type for an empty body", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).delete("/", () => undefined);

    const response = await app.handle(
      new Request("http://lyn.test/", { method: "DELETE" })
    );

    expect(response.status).toBe(204);
    expect(response.headers.has("Content-Type")).toBe(false);
    expect(response.headers.get("X-Request-Id")).toMatch(UUID_PATTERN);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns the same Headers object on every read", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
      set.headers.set("X-First", "1");
      set.headers.set("X-Second", "2");
      return "ok";
    });

    const response = await app.handle(new Request("http://lyn.test/"));

    expect(response.headers.get("X-First")).toBe("1");
    expect(response.headers.get("X-Second")).toBe("2");
  });

  it("uses a Headers object assigned by the handler", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
      set.headers = new Headers({ "X-Replaced": "yes" });
      return "ok";
    });

    const response = await app.handle(new Request("http://lyn.test/"));

    expect(response.headers.get("X-Replaced")).toBe("yes");
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("replaces an X-Request-Id set by the handler with the request's id", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
      set.headers.set("X-Request-Id", "forged");
      return "ok";
    });

    const response = await app.handle(
      new Request("http://lyn.test/", { headers: { "X-Request-Id": "req-42" } })
    );

    expect(response.headers.get("X-Request-Id")).toBe("req-42");
  });

  it("keeps a Content-Type set by the handler", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
      set.headers.set("Content-Type", "application/problem+json");
      return { title: "Teapot" };
    });

    const response = await app.handle(new Request("http://lyn.test/"));

    expect(response.headers.get("Content-Type")).toBe("application/problem+json");
  });

  it.each([
    ["a validation error", "GET", "/validated?page=abc"],
    ["a thrown error", "GET", "/boom"],
    ["an unknown route", "GET", "/missing"],
    ["a method that is not allowed", "PUT", "/boom"],
    ["a preflight without CORS", "OPTIONS", "/boom"],
  ])("adds the request headers to %s", async (_, method, path) => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/validated", () => "ok", { query: z.object({ page: z.number() }) })
      .get("/boom", () => {
        throw new Error("boom");
      });

    const response = await app.handle(
      new Request(`http://lyn.test${path}`, {
        method,
        headers: { "X-Request-Id": "req-42" },
      })
    );

    expect(response.ok).toBe(method === "OPTIONS");
    expect(response.headers.get("X-Request-Id")).toBe("req-42");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
