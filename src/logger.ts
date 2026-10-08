import { LynEnvError } from "#/env";
import pino, { type LevelWithSilent, type LoggerOptions } from "pino";

const LOG_LEVELS: LevelWithSilent[] = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
];

const isLogLevel = (value: string): value is LevelWithSilent =>
  (LOG_LEVELS as string[]).includes(value);

const resolveLevel = (
  env: Record<string, string | undefined>
): LevelWithSilent => {
  if (env.NODE_ENV === "lyn-test") return "silent";

  const level = env.LOG_LEVEL ?? "info";
  if (!isLogLevel(level))
    throw new LynEnvError([`LOG_LEVEL: expected one of ${LOG_LEVELS.join(", ")}`]);
  return level;
};

/** @lintignore */
export const createLoggerOptions = (
  env: Record<string, string | undefined>
): LoggerOptions => {
  const level = resolveLevel(env);
  if (env.NODE_ENV === "production") return { level };
  return { level, transport: { target: "pino-pretty" } };
};

export const logger = pino(createLoggerOptions(Bun.env));

export const internalLogger = logger.child({}, { msgPrefix: "[Lyn] " });
