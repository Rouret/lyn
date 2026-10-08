import { getEnvConfig, LynEnvError, lynEnvConfig } from "#/env";
import { Lyn } from "#/index";
import { describe, it, expect, spyOn } from "bun:test";

const withEnv = (values: Record<string, string | undefined>, run: () => void) => {
  const previousValues = Object.fromEntries(
    Object.keys(values).map((name) => [name, Bun.env[name]])
  );
  const assign = (entries: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(entries)) {
      if (value === undefined) delete Bun.env[name];
      else Bun.env[name] = value;
    }
  };

  assign(values);
  try {
    run();
  } finally {
    assign(previousValues);
  }
};

const configWith = (type: "string" | "number" | "boolean") =>
  ({
    ...lynEnvConfig,
    value: { name: "LYN_TEST_VALUE", type },
  }) as typeof lynEnvConfig;

describe("getEnvConfig", () => {
  it("returns parsed env config when all variables are valid", () => {
    withEnv({ NODE_ENV: "staging" }, () => {
      expect(getEnvConfig(lynEnvConfig)).toEqual({ env: "staging" });
    });
  });

  it("throws a LynEnvError listing missing and invalid variables", () => {
    withEnv({ NODE_ENV: undefined, LYN_TEST_VALUE: "abc" }, () => {
      const parse = () => getEnvConfig(configWith("number"));

      expect(parse).toThrow(LynEnvError);
      expect(parse).toThrow(
        "Invalid environment variables:\n" +
          "  - NODE_ENV: missing\n" +
          "  - LYN_TEST_VALUE: expected a number"
      );
    });
  });

  it("never includes the rejected value in the error", () => {
    withEnv({ LYN_TEST_VALUE: "s3cr3t-token" }, () => {
      expect(() => getEnvConfig(configWith("boolean"))).toThrow(
        expect.objectContaining({
          message: expect.not.stringContaining("s3cr3t-token"),
        })
      );
    });
  });

  it("does not exit the process", () => {
    const exitSpy = spyOn(process, "exit");

    try {
      withEnv({ NODE_ENV: undefined }, () => {
        expect(() => new Lyn()).toThrow(LynEnvError);
      });
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  it.each([
    ["an empty string", "string", ""],
    ["a blank string", "string", "   "],
    ["an empty number", "number", ""],
    ["a blank number", "number", "  "],
    ["an empty boolean", "boolean", ""],
  ] as const)("reports %s as missing", (_, type, rawValue) => {
    withEnv({ LYN_TEST_VALUE: rawValue }, () => {
      expect(() => getEnvConfig(configWith(type))).toThrow(
        "  - LYN_TEST_VALUE: missing"
      );
    });
  });

  it.each([
    ["number", "abc", "expected a number"],
    ["boolean", "yes", "expected true, false, 1 or 0"],
  ] as const)("reports an invalid %s", (type, rawValue, reason) => {
    withEnv({ LYN_TEST_VALUE: rawValue }, () => {
      expect(() => getEnvConfig(configWith(type))).toThrow(
        `  - LYN_TEST_VALUE: ${reason}`
      );
    });
  });

  it.each([
    ["string", " hello ", " hello "],
    ["number", " 42 ", 42],
    ["number", "-1.5", -1.5],
    ["boolean", "0", false],
  ] as const)("parses a valid %s (%p)", (type, rawValue, expected) => {
    withEnv({ LYN_TEST_VALUE: rawValue }, () => {
      expect(getEnvConfig(configWith(type))).toMatchObject({
        value: expected,
      });
    });
  });
});
