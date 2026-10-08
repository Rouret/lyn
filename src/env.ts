import z from "zod";

type EnvType = "string" | "number" | "boolean";

type EnvVariable = {
  name: string;
  type: EnvType;
};

export type EnvConfig = Record<string, EnvVariable>;

type EnvValue<TType extends EnvType> = TType extends "number"
  ? number
  : TType extends "boolean"
    ? boolean
    : string;

type InferEnv<TConfig extends EnvConfig> = {
  [Key in keyof TConfig]: EnvValue<TConfig[Key]["type"]>;
};

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

export const lynEnvConfig = {
  nodeEnv: { name: "NODE_ENV", type: "string" },
} as const satisfies EnvConfig;

export type LynEnv<TEnvConfig extends EnvConfig = {}> = InferEnv<
  typeof lynEnvConfig & TEnvConfig
>;

export const parseEnv = <TConfig extends EnvConfig>(
  config: TConfig
): InferEnv<TConfig> => {
  const env: Record<string, unknown> = {};
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

    env[key] = data;
  }

  if (problems.length > 0) throw new LynEnvError(problems);
  return env as InferEnv<TConfig>;
};
