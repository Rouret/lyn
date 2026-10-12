import { isClientError, isServerError } from "#lyn/http-status";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "pino";

type LogMethod = (fields: object, message: string) => void;
type LogLevel = "info" | "warn" | "error";

export type RequestLogger = Record<LogLevel, LogMethod> & {
  isLevelEnabled: (level: LogLevel) => boolean;
};

type RequestLogEntry = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

export const REQUEST_ID_HEADER = "X-Request-Id";
const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = new RegExp(`^[A-Za-z0-9._-]{1,${MAX_REQUEST_ID_LENGTH}}$`);

export const resolveRequestId = (request: Request): string => {
  const incomingId = request.headers.get(REQUEST_ID_HEADER);
  return incomingId && SAFE_REQUEST_ID.test(incomingId)
    ? incomingId
    : crypto.randomUUID();
};

export const createRequestLogger = (
  parent: Logger,
  requestId: string
): RequestLogger => {
  let child: Logger | undefined;
  const requestChild = () => (child ??= parent.child({ requestId }));

  return {
    info: (fields, message) => requestChild().info(fields, message),
    warn: (fields, message) => requestChild().warn(fields, message),
    error: (fields, message) => requestChild().error(fields, message),
    isLevelEnabled: (level) => parent.isLevelEnabled(level),
  };
};

const levelForStatus = (status: number): LogLevel => {
  if (isServerError(status)) return "error";
  if (isClientError(status)) return "warn";
  return "info";
};

const roundToHundredths = (value: number) => Math.round(value * 100) / 100;

export const logRequest = (log: RequestLogger, entry: RequestLogEntry) => {
  const level = levelForStatus(entry.status);
  if (!log.isLevelEnabled(level)) return;

  const durationMs = roundToHundredths(entry.durationMs);
  log[level](
    { ...entry, durationMs },
    `${entry.method} ${entry.path} ${entry.status} ${durationMs}ms`
  );
};

const requestLogStorage = new AsyncLocalStorage<RequestLogger>();

export const runWithRequestLog = <T>(log: RequestLogger, run: () => T): T =>
  requestLogStorage.run(log, run);

export const currentRequestLog = (): RequestLogger | undefined =>
  requestLogStorage.getStore();

const stackFrames = (error: Error): string | undefined => {
  const frames = error.stack
    ?.split("\n")
    .filter((line) => line.startsWith("    at ") || line.startsWith("\tat "))
    .join("\n");
  return frames === undefined || frames === "" ? undefined : frames;
};

const errorCode = (value: unknown): string | number | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  if ("errno" in value && typeof value.errno === "string") return value.errno;
  if ("code" in value && (typeof value.code === "string" || typeof value.code === "number"))
    return value.code;
  return undefined;
};

// Drizzle puts the SQL and its parameter values in the error message.
export const errorForLog = (error: unknown) => {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const stack = stackFrames(error);
  const code = errorCode(error) ?? errorCode(error.cause);
  return {
    name: error.name,
    ...(stack === undefined ? {} : { stack }),
    ...(code === undefined ? {} : { code }),
  };
};
