import z from "zod";

type EnvConfigItem = {
  name: string;
  type: EnvType;
};

/* We create this to avoid user to use the z.ZodString | z.ZodCoercedNumber | typeof zBooleanFromEnv type */
type EnvType = "string" | "number" | "boolean";

type EnvNames = "env";

export type EnvConfig = Record<string, EnvConfigItem>;
type InternalEnvConfig = Record<EnvNames, EnvConfigItem>;

const isBlank = (value: string | undefined) =>
  value === undefined || value.trim() === "";

const zNumberFromEnv = z.string().pipe(z.coerce.number());

const zBooleanFromEnv = z
  .enum(["true", "1", "false", "0"])
  .transform((value) => value === "true" || value === "1");

const ENV_PARSERS: Record<EnvType, { schema: z.ZodType; expected: string }> = {
  string: { schema: z.string(), expected: "a string" },
  number: { schema: zNumberFromEnv, expected: "a number" },
  boolean: { schema: zBooleanFromEnv, expected: "true, false, 1 or 0" },
};

export class LynEnvError extends Error {
  constructor(problems: string[]) {
    super(
      ["Invalid environment variables:", ...problems.map((p) => `  - ${p}`)].join(
        "\n"
      )
    );
    this.name = "LynEnvError";
  }
}

export const lynEnvConfig: InternalEnvConfig = {
  env: {
    name: "NODE_ENV",
    type: "string",
  },
};

export type LynEnv = Record<EnvNames, string | number | boolean>;

export const getEnvConfig = (config: InternalEnvConfig): LynEnv => {
  const env: Partial<LynEnv> = {};
  const problems: string[] = [];

  for (const [key, { name, type }] of Object.entries(config)) {
    const rawValue = Bun.env[name];
    if (isBlank(rawValue)) {
      problems.push(`${name}: missing`);
      continue;
    }

    const { schema, expected } = ENV_PARSERS[type];
    const { success, data } = schema.safeParse(rawValue);
    if (!success) {
      problems.push(`${name}: expected ${expected}`);
      continue;
    }

    env[key as EnvNames] = data as LynEnv[EnvNames];
  }

  if (problems.length > 0) throw new LynEnvError(problems);
  return env as LynEnv;
};
