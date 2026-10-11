import { isClientError, isServerError } from "#lyn/http-status";
import { AsyncLocalStorage } from "node:async_hooks";

type LogMethod = (fields: object, message: string) => void;

export type RequestLogger = {
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
};

type RequestLogEntry = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = new RegExp(`^[A-Za-z0-9._-]{1,${MAX_REQUEST_ID_LENGTH}}$`);

export const resolveRequestId = (request: Request): string => {
  const incomingId = request.headers.get("X-Request-Id");
  return incomingId && SAFE_REQUEST_ID.test(incomingId)
    ? incomingId
    : crypto.randomUUID();
};

const levelForStatus = (status: number): keyof RequestLogger => {
  if (isServerError(status)) return "error";
  if (isClientError(status)) return "warn";
  return "info";
};

const roundToHundredths = (value: number) => Math.round(value * 100) / 100;

export const logRequest = (log: RequestLogger, entry: RequestLogEntry) => {
  const durationMs = roundToHundredths(entry.durationMs);
  log[levelForStatus(entry.status)](
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
