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
});
