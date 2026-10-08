import { Lyn } from "#/index";
import { logRequest, resolveRequestId } from "#/request-log";
import { describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const createFakeLog = () => {
  const calls: { level: string; fields: object; message: string }[] = [];
  const record =
    (level: string) =>
    (fields: object, message: string) =>
      calls.push({ level, fields, message });
  return {
    calls,
    log: { info: record("info"), warn: record("warn"), error: record("error") },
  };
};

describe("logRequest", () => {
  it.each([
    [200, "info"],
    [302, "info"],
    [404, "warn"],
    [422, "warn"],
    [500, "error"],
  ])("logs a %i response at %s level", (status, level) => {
    const { calls, log } = createFakeLog();

    logRequest(log, {
      method: "GET",
      path: "/users",
      status,
      durationMs: 3.456,
    });

    expect(calls).toEqual([
      {
        level,
        fields: { method: "GET", path: "/users", status, durationMs: 3.46 },
        message: `GET /users ${status} 3.46ms`,
      },
    ]);
  });
});

describe("resolveRequestId", () => {
  const requestWithId = (requestId?: string) =>
    new Request("http://lyn.test/", {
      headers: requestId === undefined ? {} : { "X-Request-Id": requestId },
    });

  it("reuses a well-formed incoming request id", () => {
    expect(resolveRequestId(requestWithId("edge-7f3a_01.b"))).toBe(
      "edge-7f3a_01.b"
    );
  });

  it("generates a UUID when the request has no id", () => {
    expect(resolveRequestId(requestWithId())).toMatch(UUID_PATTERN);
  });

  it.each([
    ["contains spaces", "abc def"],
    ["contains quotes or markup", 'abc"}<script>'],
    ["is too long", "a".repeat(129)],
  ])("replaces an incoming id that %s", (_, requestId) => {
    expect(resolveRequestId(requestWithId(requestId))).toMatch(UUID_PATTERN);
  });
});

describe("X-Request-Id header", () => {
  const app = new Lyn(TEST_LYN_CONFIG).get("/", () => "ok");

  it("is added to every response", async () => {
    const found = await app.handle(new Request("http://lyn.test/"));
    const missing = await app.handle(new Request("http://lyn.test/missing"));

    expect(found.headers.get("x-request-id")).toMatch(UUID_PATTERN);
    expect(missing.headers.get("x-request-id")).toMatch(UUID_PATTERN);
  });

  it("echoes the incoming request id", async () => {
    const response = await app.handle(
      new Request("http://lyn.test/", { headers: { "X-Request-Id": "req-42" } })
    );

    expect(response.headers.get("x-request-id")).toBe("req-42");
  });
});
