import { isClientError, isServerError } from "#/http-status";
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
