export type CorsConfig = {
  /**
   * Origins allowed to call the API from a browser: `"*"` for any origin,
   * a list of exact origins, or a function deciding for each origin.
   */
  origin: "*" | string[] | ((origin: string) => boolean);
  /** Allow cookies and Authorization headers. Cannot be combined with `"*"`. */
  credentials?: boolean;
  /** Request headers allowed in preflight. Defaults to the headers the browser asks for. */
  allowedHeaders?: string[];
  /** Response headers readable by the browser. */
  exposedHeaders?: string[];
  /** Seconds a browser may cache a preflight response. */
  maxAge?: number;
};

const DEFAULT_MAX_AGE_SECONDS = 600;

export const assertValidCorsConfig = (config: CorsConfig) => {
  if (config.origin === "*" && config.credentials)
    throw new Error(
      'CORS origin "*" cannot be used with credentials: list the allowed origins instead'
    );
};

const isOriginAllowed = (config: CorsConfig, origin: string): boolean => {
  if (config.origin === "*") return true;
  if (Array.isArray(config.origin)) return config.origin.includes(origin);
  return config.origin(origin);
};

const isPreflight = (request: Request, response: Response) =>
  request.method === "OPTIONS" &&
  request.headers.has("Access-Control-Request-Method") &&
  response.status === 204;

const setPreflightHeaders = (
  request: Request,
  response: Response,
  config: CorsConfig
) => {
  const { headers } = response;
  headers.set("Access-Control-Allow-Methods", headers.get("Allow") ?? "");

  const allowedHeaders =
    config.allowedHeaders?.join(", ") ??
    request.headers.get("Access-Control-Request-Headers");
  if (allowedHeaders) headers.set("Access-Control-Allow-Headers", allowedHeaders);

  headers.set(
    "Access-Control-Max-Age",
    String(config.maxAge ?? DEFAULT_MAX_AGE_SECONDS)
  );
};

export const applyCors = (
  request: Request,
  response: Response,
  config: CorsConfig
): Response => {
  const { headers } = response;
  if (config.origin !== "*") headers.append("Vary", "Origin");

  const origin = request.headers.get("Origin");
  if (!origin || !isOriginAllowed(config, origin)) return response;

  headers.set(
    "Access-Control-Allow-Origin",
    config.origin === "*" ? "*" : origin
  );
  if (config.credentials)
    headers.set("Access-Control-Allow-Credentials", "true");

  if (isPreflight(request, response)) {
    setPreflightHeaders(request, response, config);
  } else if (config.exposedHeaders?.length) {
    headers.set("Access-Control-Expose-Headers", config.exposedHeaders.join(", "));
  }

  return response;
};
