import { getEnvConfig, lynEnvConfig } from "#/env";
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";

describe("getEnvConfig", () => {
  it("returns parsed env config when all variables are valid", () => {
    const env = getEnvConfig(lynEnvConfig);

    expect(env).toEqual({
      env: "lyn-test",
    });
  });

  it("exits process when a variable is missing or invalid", () => {
    Bun.env.NODE_ENV = undefined;

    const exitSpy = spyOn(process, "exit").mockImplementation(((
      code?: number
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    expect(() => getEnvConfig(lynEnvConfig)).toThrow("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
