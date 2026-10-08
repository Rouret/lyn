import { getEnvConfig, lynEnvConfig } from "#/env";
import { describe, it, expect, spyOn } from "bun:test";

const withNodeEnv = (value: string | undefined, run: () => void) => {
  const previousNodeEnv = Bun.env.NODE_ENV;
  if (value === undefined) delete Bun.env.NODE_ENV;
  else Bun.env.NODE_ENV = value;

  try {
    run();
  } finally {
    Bun.env.NODE_ENV = previousNodeEnv;
  }
};

describe("getEnvConfig", () => {
  it("returns parsed env config when all variables are valid", () => {
    withNodeEnv("staging", () => {
      expect(getEnvConfig(lynEnvConfig)).toEqual({ env: "staging" });
    });
  });

  it("exits process when a variable is missing or invalid", () => {
    const exitSpy = spyOn(process, "exit").mockImplementation(((
      code?: number
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      withNodeEnv(undefined, () => {
        expect(() => getEnvConfig(lynEnvConfig)).toThrow("process.exit(1)");
      });
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it.each([
    ["an empty string", "string", ""],
    ["a blank string", "string", "   "],
    ["an empty number", "number", ""],
    ["a blank number", "number", "  "],
    ["a non-numeric number", "number", "abc"],
    ["an empty boolean", "boolean", ""],
  ] as const)("rejects %s", (_, type, rawValue) => {
    Bun.env.LYN_TEST_VALUE = rawValue;
    const exitSpy = spyOn(process, "exit").mockImplementation(((
      code?: number
    ) => {
      throw new Error(`process.exit(${code})`);
    }) as never);

    try {
      expect(() =>
        getEnvConfig({
          ...lynEnvConfig,
          value: { name: "LYN_TEST_VALUE", type },
        } as typeof lynEnvConfig)
      ).toThrow("process.exit(1)");
    } finally {
      exitSpy.mockRestore();
      delete Bun.env.LYN_TEST_VALUE;
    }
  });

  it.each([
    ["string", " hello ", " hello "],
    ["number", " 42 ", 42],
    ["number", "-1.5", -1.5],
    ["boolean", "0", false],
  ] as const)("parses a valid %s (%p)", (type, rawValue, expected) => {
    Bun.env.LYN_TEST_VALUE = rawValue;

    try {
      expect(
        getEnvConfig({
          ...lynEnvConfig,
          value: { name: "LYN_TEST_VALUE", type },
        } as typeof lynEnvConfig)
      ).toMatchObject({ value: expected });
    } finally {
      delete Bun.env.LYN_TEST_VALUE;
    }
  });
});

