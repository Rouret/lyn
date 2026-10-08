import { internalLogger } from "#/logger";
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

const zNonBlankString = z.string().refine((value) => value.trim() !== "");

const zNumberFromEnv = z.string().trim().min(1).pipe(z.coerce.number());

const zBooleanFromEnv = z
  .enum(["true", "1", "false", "0"])
  .transform((value) => value === "true" || value === "1");

const getZodTypeFromEnvType = (type: EnvType) => {
  switch (type) {
    case "string":
      return zNonBlankString;
    case "number":
      return zNumberFromEnv;
    case "boolean":
      return zBooleanFromEnv;
    default:
      throw new Error(`Invalid environment type: ${type}`);
  }
};

export const lynEnvConfig: InternalEnvConfig = {
  env: {
    name: "NODE_ENV",
    type: "string",
  },
};

export type LynEnv = Record<EnvNames, string | number | boolean>;

export const getEnvConfig = (config: InternalEnvConfig): LynEnv => {
  //@ts-expect-error - This is a record of the environment variables
  const env: LynEnv = {};
  const missingEnv: string[] = [];

  for (const [key, value] of Object.entries(config)) {
    const envValue = Bun.env[value.name];
    const zodType = getZodTypeFromEnvType(value.type);

    //Type Check
    const { success: isValueTypeValid, data: parsedValue } =
      zodType.safeParse(envValue);

    if (!isValueTypeValid) {
      missingEnv.push(value.name);
      continue;
    }
    // To prevent defining environment variables when an error is going to be thrown
    if (missingEnv.length === 0) {
      env[key as EnvNames] = parsedValue;
    }
  }

  if (missingEnv.length > 0) {
    internalLogger.error(
      `Missing environment variables: ${missingEnv.join(", ")}`
    );
    process.exit(1);
  }
  return env;
};
