import { getEnvConfig, lynEnvConfig } from "#/env";
import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";

const ORIGINAL_ENV = { ...Bun.env };

describe("getEnvConfig", () => {
  it("returns parsed env config when all variables are valid", () => {
    Bun.env.DATABASE_USER = "user";
    Bun.env.DATABASE_PASSWORD = "password";
    Bun.env.DATABASE_HOST = "localhost";
    Bun.env.DATABASE_PORT = "5432";
    Bun.env.DATABASE_NAME = "mydb";

    const env = getEnvConfig(lynEnvConfig);

    expect(env).toEqual({
      env: "test",
      databaseUser: "user",
      databasePassword: "password",
      databaseHost: "localhost",
      databasePort: 5432,
      databaseName: "mydb",
    });
  });

  it("exits process when a variable is missing or invalid", () => {
    Bun.env.DATABASE_USER = "user";
    // DATABASE_PASSWORD missing
    Bun.env.DATABASE_HOST = "localhost";
    Bun.env.DATABASE_PORT = "not-a-number";
    Bun.env.DATABASE_NAME = "mydb";

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
