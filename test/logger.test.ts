import { LynEnvError } from "#/env";
import { createLoggerOptions } from "#/logger";
import { describe, expect, it } from "bun:test";

describe("createLoggerOptions", () => {
  it("logs JSON at info level in production", () => {
    expect(createLoggerOptions({ NODE_ENV: "production" })).toEqual({
      level: "info",
    });
  });

  it("pretty-prints outside production", () => {
    expect(createLoggerOptions({ NODE_ENV: "development" })).toEqual({
      level: "info",
      transport: { target: "pino-pretty" },
    });
  });

  it("uses LOG_LEVEL when set", () => {
    expect(
      createLoggerOptions({ NODE_ENV: "production", LOG_LEVEL: "debug" })
    ).toEqual({ level: "debug" });
  });

  it("is silent in Lyn's own test environment", () => {
    expect(createLoggerOptions({ NODE_ENV: "lyn-test" })).toMatchObject({
      level: "silent",
    });
  });

  it("rejects an unknown LOG_LEVEL", () => {
    const create = () =>
      createLoggerOptions({ NODE_ENV: "production", LOG_LEVEL: "verbose" });

    expect(create).toThrow(LynEnvError);
    expect(create).toThrow(
      "LOG_LEVEL: expected one of fatal, error, warn, info, debug, trace, silent"
    );
  });
});
