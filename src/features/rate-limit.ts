import { TooManyRequestsError } from "#lyn/error";
import type { ClientInfo, FeatureDefinition } from "#lyn/features/feature";

export type RateLimitConfig = {
  /** Requests a client may send per window. */
  max: number;
  /**
   * Length of a window, in milliseconds.
   * @default 60000
   */
  windowMs?: number;
  /**
   * Identifies the client. Defaults to the IP of the TCP connection, which is
   * your proxy's behind a reverse proxy. `undefined` skips the limit.
   */
  key?: (request: Request, client: ClientInfo) => string | undefined;
};

type Window = { count: number; resetAt: number };

const DEFAULT_WINDOW_MS = 60_000;
const MS_PER_SECOND = 1000;

const assertPositiveInteger = (value: number, name: string) => {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`rateLimit.${name} must be a positive integer`);
};

const keyByIp = (_request: Request, { ip }: ClientInfo) => ip;

const createRateLimiter = ({ max, windowMs = DEFAULT_WINDOW_MS, key = keyByIp }: RateLimitConfig) => {
  const windows = new Map<string, Window>();
  let nextSweepAt = 0;

  const sweepExpiredWindows = (now: number) => {
    if (now < nextSweepAt) return;
    for (const [clientKey, window] of windows)
      if (window.resetAt <= now) windows.delete(clientKey);
    nextSweepAt = now + windowMs;
  };

  return (request: Request, client: ClientInfo) => {
    const clientKey = key(request, client);
    if (clientKey === undefined) return undefined;

    const now = Date.now();
    sweepExpiredWindows(now);

    const window = windows.get(clientKey);
    if (!window || window.resetAt <= now) {
      windows.set(clientKey, { count: 1, resetAt: now + windowMs });
      return undefined;
    }
    window.count++;
    if (window.count <= max) return undefined;
    return new TooManyRequestsError(Math.ceil((window.resetAt - now) / MS_PER_SECOND));
  };
};

export const rateLimitFeature: FeatureDefinition = ({ rateLimit }) => {
  if (!rateLimit) return undefined;
  assertPositiveInteger(rateLimit.max, "max");
  if (rateLimit.windowMs !== undefined) assertPositiveInteger(rateLimit.windowMs, "windowMs");
  return {
    create: () => ({ onRequest: createRateLimiter(rateLimit) }),
  };
};
