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

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const resolveRequestId = (request: Request): string => {
  const incomingId = request.headers.get("X-Request-Id");
  return incomingId && SAFE_REQUEST_ID.test(incomingId)
    ? incomingId
    : crypto.randomUUID();
};

const levelForStatus = (status: number): keyof RequestLogger => {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
};

export const logRequest = (log: RequestLogger, entry: RequestLogEntry) => {
  const durationMs = Math.round(entry.durationMs * 100) / 100;
  log[levelForStatus(entry.status)](
    { ...entry, durationMs },
    `${entry.method} ${entry.path} ${entry.status} ${durationMs}ms`
  );
};
