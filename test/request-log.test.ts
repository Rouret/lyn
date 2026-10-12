import { Lyn } from "#lyn/index";
import {
  createRequestLogger,
  errorForLog,
  logRequest,
  resolveRequestId,
} from "#lyn/request-log";
import { describe, expect, it, spyOn } from "bun:test";
import pino from "pino";
import { TEST_LYN_CONFIG } from "test/constantsTest";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const createFakeLog = (enabledLevels = ["info", "warn", "error"]) => {
  const calls: { level: string; fields: object; message: string }[] = [];
  const record =
    (level: string) =>
    (fields: object, message: string) =>
      calls.push({ level, fields, message });
  return {
    calls,
    log: {
      info: record("info"),
      warn: record("warn"),
      error: record("error"),
      isLevelEnabled: (level: string) => enabledLevels.includes(level),
    },
  };
};

const createCapturedLogger = (level: pino.LevelWithSilent) => {
  const lines: Record<string, unknown>[] = [];
  const logger = pino({ level }, { write: (line: string) => lines.push(JSON.parse(line)) });
  return { lines, logger };
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

describe("logRequest level", () => {
  it.each([
    [200, ["warn", "error"]],
    [404, ["error"]],
    [500, []],
  ])("skips a %i response when its level is disabled", (status, enabledLevels) => {
    const { calls, log } = createFakeLog(enabledLevels);

    logRequest(log, { method: "GET", path: "/users", status, durationMs: 1 });

    expect(calls).toEqual([]);
  });
});

describe("createRequestLogger", () => {
  it("adds the request id to every line", () => {
    const { lines, logger } = createCapturedLogger("info");
    const log = createRequestLogger(logger, "req-42");

    log.info({ step: 1 }, "first");
    log.warn({ step: 2 }, "second");
    log.error({ step: 3 }, "third");

    expect(lines).toMatchObject([
      { level: 30, requestId: "req-42", step: 1, msg: "first" },
      { level: 40, requestId: "req-42", step: 2, msg: "second" },
      { level: 50, requestId: "req-42", step: 3, msg: "third" },
    ]);
  });

  it("creates the child logger only when a line is written, once", () => {
    const { logger } = createCapturedLogger("info");
    const child = spyOn(logger, "child");
    const log = createRequestLogger(logger, "req-42");

    expect(log.isLevelEnabled("info")).toBe(true);
    expect(child).not.toHaveBeenCalled();

    log.info({}, "first");
    log.info({}, "second");
    expect(child).toHaveBeenCalledTimes(1);
  });

  it("reports the parent's enabled levels", () => {
    const { logger } = createCapturedLogger("warn");
    const log = createRequestLogger(logger, "req-42");

    expect(log.isLevelEnabled("info")).toBe(false);
    expect(log.isLevelEnabled("warn")).toBe(true);
    expect(log.isLevelEnabled("error")).toBe(true);
  });
});

describe("errorForLog", () => {
  it("keeps the stack frames and drops the message", () => {
    const error = new Error("password=s3cr3t");
    error.name = "DrizzleQueryError";
    Object.assign(error, { errno: "23505" });

    const logged = errorForLog(error);

    expect(logged).toMatchObject({ name: "DrizzleQueryError", code: "23505" });
    expect(JSON.stringify(logged)).not.toContain("s3cr3t");
    expect("stack" in logged).toBe(true);
  });

  it("reads the code from the cause when the error has none", () => {
    const error = new Error("Failed query: insert into users values ($1)\nparams: secret@example.com");
    error.cause = Object.assign(new Error("duplicate key"), { errno: "23505" });

    const logged = errorForLog(error);

    expect(logged).toMatchObject({ name: "Error", code: "23505" });
    expect(JSON.stringify(logged)).not.toContain("secret@example.com");
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
