import { Lyn } from "#/index";
import type { LynConfig } from "#/types";
import { describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import z from "zod";

const APP_ORIGIN = "https://app.example.com";
const OTHER_ORIGIN = "https://evil.example.com";

const createApp = (cors?: LynConfig["cors"]) =>
  new Lyn({ ...TEST_LYN_CONFIG, cors })
    .get("/users", () => [{ name: "Ada" }])
    .post("/users", ({ body }) => body, {
      body: z.object({ name: z.string() }),
    })
    .get("/error", () => {
      throw new Error("boom");
    });

const send = (
  app: Lyn,
  path: string,
  { method = "GET", headers = {} }: { method?: string; headers?: Record<string, string> } = {}
) => app.handle(new Request(`http://lyn.test${path}`, { method, headers }));

const preflight = (app: Lyn, origin: string, requestedHeaders?: string) =>
  send(app, "/users", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      ...(requestedHeaders
        ? { "Access-Control-Request-Headers": requestedHeaders }
        : {}),
    },
  });

const corsHeadersOf = (response: Response) =>
  Object.fromEntries(
    [...response.headers.entries()].filter(
      ([name]) => name.startsWith("access-control-") || name === "vary"
    )
  );

describe("CORS disabled (default)", () => {
  it("sends no CORS header on responses", async () => {
    const response = await send(createApp(), "/users", {
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(corsHeadersOf(response)).toEqual({});
  });

  it("answers preflight with Allow only", async () => {
    const response = await preflight(createApp(), APP_ORIGIN);

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, POST, OPTIONS");
    expect(corsHeadersOf(response)).toEqual({});
  });
});

describe("CORS with a wildcard origin", () => {
  const app = createApp({ origin: "*" });

  it("allows any origin without Vary", async () => {
    const response = await send(app, "/users", {
      headers: { Origin: OTHER_ORIGIN },
    });

    expect(corsHeadersOf(response)).toEqual({
      "access-control-allow-origin": "*",
    });
  });

  it.each([
    ["a 404", "/missing", "GET"],
    ["a 405", "/users", "DELETE"],
    ["a 500", "/error", "GET"],
  ])("adds the headers to %s", async (_, path, method) => {
    const response = await send(app, path, {
      method,
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("adds the headers to a validation error", async () => {
    const response = await app.handle(
      new Request("http://lyn.test/users", {
        method: "POST",
        headers: { Origin: APP_ORIGIN, "Content-Type": "application/json" },
        body: "{}",
      })
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("sends no CORS header when the request has no Origin", async () => {
    const response = await send(app, "/users");

    expect(corsHeadersOf(response)).toEqual({});
  });
});

describe("CORS with a list of origins", () => {
  const app = createApp({ origin: [APP_ORIGIN] });

  it("echoes an allowed origin and varies on Origin", async () => {
    const response = await send(app, "/users", {
      headers: { Origin: APP_ORIGIN },
    });

    expect(corsHeadersOf(response)).toEqual({
      "access-control-allow-origin": APP_ORIGIN,
      vary: "Origin",
    });
  });

  it("processes a request from another origin without CORS headers", async () => {
    const response = await send(app, "/users", {
      headers: { Origin: OTHER_ORIGIN },
    });

    expect(response.status).toBe(200);
    expect(corsHeadersOf(response)).toEqual({ vary: "Origin" });
  });

  it("varies on Origin even without an Origin header", async () => {
    const response = await send(app, "/users");

    expect(corsHeadersOf(response)).toEqual({ vary: "Origin" });
  });
});

describe("CORS with an origin function", () => {
  const app = createApp({
    origin: (origin) => origin.endsWith(".example.com"),
  });

  it("allows origins accepted by the function", async () => {
    const response = await send(app, "/users", {
      headers: { Origin: OTHER_ORIGIN },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(
      OTHER_ORIGIN
    );
  });

  it("rejects origins refused by the function", async () => {
    const response = await send(app, "/users", {
      headers: { Origin: "https://example.org" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("CORS options", () => {
  it("allows credentials", async () => {
    const app = createApp({ origin: [APP_ORIGIN], credentials: true });

    const response = await send(app, "/users", {
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true"
    );
  });

  it("exposes headers on actual responses", async () => {
    const app = createApp({ origin: "*", exposedHeaders: ["X-Total", "ETag"] });

    const response = await send(app, "/users", {
      headers: { Origin: APP_ORIGIN },
    });

    expect(response.headers.get("access-control-expose-headers")).toBe(
      "X-Total, ETag"
    );
  });

  it("refuses a wildcard origin with credentials", () => {
    expect(() => createApp({ origin: "*", credentials: true })).toThrow(
      'CORS origin "*" cannot be used with credentials: list the allowed origins instead'
    );
  });
});

describe("CORS preflight", () => {
  it("answers with methods, requested headers and the default max age", async () => {
    const app = createApp({ origin: [APP_ORIGIN] });

    const response = await preflight(app, APP_ORIGIN, "content-type, x-trace");

    expect(response.status).toBe(204);
    expect(corsHeadersOf(response)).toEqual({
      "access-control-allow-origin": APP_ORIGIN,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-trace",
      "access-control-max-age": "600",
      vary: "Origin",
    });
  });

  it("uses configured headers and max age", async () => {
    const app = createApp({
      origin: [APP_ORIGIN],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 60,
      exposedHeaders: ["X-Total"],
    });

    const response = await preflight(app, APP_ORIGIN, "x-anything");

    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type, Authorization"
    );
    expect(response.headers.get("access-control-max-age")).toBe("60");
    expect(response.headers.get("access-control-expose-headers")).toBeNull();
  });

  it("sends no CORS header to a refused origin", async () => {
    const app = createApp({ origin: [APP_ORIGIN] });

    const response = await preflight(app, OTHER_ORIGIN);

    expect(response.status).toBe(204);
    expect(corsHeadersOf(response)).toEqual({ vary: "Origin" });
  });
});
