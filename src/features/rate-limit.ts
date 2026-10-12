import { TooManyRequestsError } from "#lyn/error";
import { isPreflightRequest } from "#lyn/features/cors";
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
  key?: (request: Request, client: ClientInfo) => string | undefined | Promise<string | undefined>;
  /** Return `true` to let a request through without counting it. */
  skip?: (request: Request, client: ClientInfo) => boolean | Promise<boolean>;
};

type Window = { count: number; resetAt: number };

const DEFAULT_WINDOW_MS = 60_000;
const MS_PER_SECOND = 1000;
const MAX_CLIENTS_PER_GENERATION = 100_000;

const assertPositiveInteger = (value: number, name: string) => {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`rateLimit.${name} must be a positive integer`);
};

const keyByIp = (_request: Request, { ip }: ClientInfo) => ip;

// Dropping a whole generation avoids an O(n) sweep; the size cap bounds memory.
const createWindowStore = (windowMs: number) => {
  let current = new Map<string, Window>();
  let previous = new Map<string, Window>();
  let rotateAt = 0;

  const rotate = (now: number) => {
    const currentHasLiveWindows = now < rotateAt + windowMs;
    previous = currentHasLiveWindows ? current : new Map();
    current = new Map();
    rotateAt = now + windowMs;
  };

  return (clientKey: string, now: number): Window => {
    if (now >= rotateAt) rotate(now);
    const window = current.get(clientKey) ?? previous.get(clientKey);
    if (window && window.resetAt > now) {
      window.count++;
      return window;
    }
    if (current.size >= MAX_CLIENTS_PER_GENERATION) rotate(now);
    const freshWindow = { count: 1, resetAt: now + windowMs };
    current.set(clientKey, freshWindow);
    return freshWindow;
  };
};

const createRateLimiter = ({
  max,
  windowMs = DEFAULT_WINDOW_MS,
  key = keyByIp,
  skip,
}: RateLimitConfig) => {
  const countRequest = createWindowStore(windowMs);

  return async (request: Request, client: ClientInfo) => {
    if (isPreflightRequest(request)) return undefined;
    if (await skip?.(request, client)) return undefined;
    const clientKey = await key(request, client);
    if (clientKey === undefined) return undefined;

    const now = performance.now();
    const window = countRequest(clientKey, now);
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
