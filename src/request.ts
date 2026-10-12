import {
  InternalServerError,
  InvalidHostError,
  isLynError,
  LynError,
  MethodNotAllowedError,
  NotFoundError,
  RequestTimeoutError,
  ValidationError,
} from "#lyn/error";
import { HTTP_STATUS } from "#lyn/http-status";
import {
  errorForLog,
  REQUEST_ID_HEADER,
  type RequestLogger,
} from "#lyn/request-log";
import type { Route, RouteHandlerBodyResponse, SetDefinition } from "#lyn/types";
import { readJsonBody } from "#lyn/body";
import { parseParams } from "#lyn/params";
import { parseQuery } from "#lyn/query";
import type { RouteMatch } from "#lyn/router";
import { getDefaultStatusFromMethod } from "#lyn/utils";
import type { ZodSafeParseResult } from "zod";

/*
 Request -> handleRouteMatch -> 404 / 405 / OPTIONS ---------------------> Response
                    |                                                   ^
                    -> handleRequestLifecycle:                          |
                         handleRequest -> handler -> handleResponse ----|
                           | (on error)                                 |
                           -> handleError ------------------------------
 */
type AnyRoute = Route<any, any, any, any>;

type RequestDispatch = {
  request: Request;
  pathname: string;
  match: RouteMatch;
  log: RequestLogger;
  requestId: string;
  appContext: Record<string, unknown>;
  mapError: (error: unknown) => LynError | undefined;
  maxBodyBytes: number;
  requestTimeoutMs: number;
};

export const handleRouteMatch = ({
  request,
  pathname,
  match,
  log,
  requestId,
  appContext,
  mapError,
  maxBodyBytes,
  requestTimeoutMs,
}: RequestDispatch): Promise<Response> | Response => {
  switch (match.status) {
    case "found":
      return handleRequestLifecycle(request, match.route, match.params, {
        log,
        requestId,
        appContext,
        mapError,
        maxBodyBytes,
        requestTimeoutMs,
      });
    case "method_not_allowed":
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: HTTP_STATUS.NO_CONTENT,
          headers: {
            ...requestHeaders(requestId),
            Allow: [...match.allowedMethods, "OPTIONS"].join(", "),
          },
        });
      }
      return handleError(
        new MethodNotAllowedError(request.method, pathname, match.allowedMethods),
        requestId
      );
    case "not_found":
      return handleError(new NotFoundError(request.method, pathname), requestId);
  }
};

const handleRequestLifecycle = (
  request: Request,
  route: AnyRoute,
  params: Record<string, string>,
  {
    log,
    requestId,
    appContext,
    mapError,
    maxBodyBytes,
    requestTimeoutMs,
  }: Omit<RequestDispatch, "request" | "pathname" | "match">
): Response | Promise<Response> => {
  const set = new ResponseSet(getDefaultStatusFromMethod(route.method));
  const respond = (body: RouteHandlerBodyResponse) =>
    handleResponse(body, ResponseSet.headersOf(set), set.status, requestId);
  const abort = createRequestAbort(request);
  const failWith = (error: unknown) =>
    handleLifecycleError(error, { log, mapError, requestId });

  try {
    const pendingBody = handleRequest(
      request,
      params,
      route,
      { set, abort, appContext },
      maxBodyBytes
    );
    if (!isPromiseLike(pendingBody)) return respond(pendingBody);

    return withTimeout(pendingBody, requestTimeoutMs, abort)
      .then(respond)
      .catch(failWith);
  } catch (error: unknown) {
    return failWith(error);
  }
};

class ResponseSet implements SetDefinition {
  #headers: Headers | undefined;

  constructor(public status: number) {}

  get headers(): Headers {
    return (this.#headers ??= new Headers());
  }

  set headers(replaced: Headers) {
    this.#headers = replaced;
  }

  static headersOf(set: ResponseSet): Headers | undefined {
    return set.#headers;
  }
}

const handleLifecycleError = (
  error: unknown,
  { log, mapError, requestId }: Pick<RequestDispatch, "log" | "mapError" | "requestId">
): Response => {
  if (isLynError(error)) return handleError(error, requestId);
  const mappedError = mapError(error);
  if (mappedError) {
    log.warn(errorForLog(error), `Handler error mapped to ${mappedError.code}`);
    return handleError(mappedError, requestId);
  }
  log.error(errorForLog(error), "Unhandled error in route handler");
  return handleError(new InternalServerError(), requestId);
};

const CONTENT_TYPE = {
  TEXT: "text/plain; charset=utf-8",
  JSON: "application/json",
} as const;
const CONTENT_TYPE_OPTIONS_HEADER = "X-Content-Type-Options";
const NOSNIFF = "nosniff";

const defaultContentType = (body: RouteHandlerBodyResponse) => {
  if (body === undefined) return undefined;
  return typeof body === "string" ? CONTENT_TYPE.TEXT : CONTENT_TYPE.JSON;
};

const requestHeaders = (requestId: string): Record<string, string> => ({
  [REQUEST_ID_HEADER]: requestId,
  [CONTENT_TYPE_OPTIONS_HEADER]: NOSNIFF,
});

const addRequestHeaders = (headers: Headers, requestId: string): Headers => {
  headers.set(REQUEST_ID_HEADER, requestId);
  if (!headers.has(CONTENT_TYPE_OPTIONS_HEADER))
    headers.set(CONTENT_TYPE_OPTIONS_HEADER, NOSNIFF);
  return headers;
};

const responseHeaders = (
  handlerHeaders: Headers | undefined,
  contentType: string | undefined,
  requestId: string
): Headers | Record<string, string> => {
  if (!handlerHeaders) {
    const headers = requestHeaders(requestId);
    if (contentType) headers["Content-Type"] = contentType;
    return headers;
  }

  if (contentType && !handlerHeaders.has("Content-Type"))
    handlerHeaders.set("Content-Type", contentType);
  return addRequestHeaders(handlerHeaders, requestId);
};

const handleResponse = (
  body: RouteHandlerBodyResponse,
  handlerHeaders: Headers | undefined,
  status: number,
  requestId: string
): Response => {
  const init = {
    status,
    headers: responseHeaders(handlerHeaders, defaultContentType(body), requestId),
  };
  if (body === undefined) return new Response(null, init);
  if (typeof body === "string") return new Response(body, init);
  return Response.json(body, init);
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export const resolveRequestTimeoutMs = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("server.requestTimeoutMs must be a positive integer");
  return value;
};

type RequestAbort = {
  readonly signal: AbortSignal;
  abort: (reason: Error) => void;
};

const createRequestAbort = (request: Request): RequestAbort => {
  let controller: AbortController | undefined;
  let signal: AbortSignal | undefined;
  const timeoutController = () => (controller ??= new AbortController());

  return {
    get signal() {
      signal ??= AbortSignal.any([request.signal, timeoutController().signal]);
      return signal;
    },
    abort: (reason) => timeoutController().abort(reason),
  };
};

export const isPromiseLike = <T>(value: T | PromiseLike<T>): value is PromiseLike<T> =>
  typeof (value as PromiseLike<T> | null | undefined)?.then === "function";

const withTimeout = async <T>(
  work: PromiseLike<T>,
  timeoutMs: number,
  abort: RequestAbort
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new RequestTimeoutError();
      abort.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const dataOrThrow = <T>(result: ZodSafeParseResult<T>): T => {
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
};

type HandlerInput = {
  set: SetDefinition;
  abort: RequestAbort;
  appContext: Record<string, unknown>;
};

type ValidatedInput = { body?: unknown; params?: unknown; query?: unknown };

const handleRequest = (
  request: Request,
  params: Record<string, string>,
  route: AnyRoute,
  input: HandlerInput,
  maxBodyBytes: number
): RouteHandlerBodyResponse | Promise<RouteHandlerBodyResponse> => {
  const bodySchema = route.validation?.body;
  if (!bodySchema) return runHandler(request, params, route, input, {});

  return readJsonBody(request, maxBodyBytes).then((body) =>
    runHandler(request, params, route, input, {
      body: dataOrThrow(bodySchema.safeParse(body)),
    })
  );
};

const runHandler = (
  request: Request,
  params: Record<string, string>,
  { handler, validation }: AnyRoute,
  { set, abort, appContext }: HandlerInput,
  validatedInput: ValidatedInput
): RouteHandlerBodyResponse => {
  if (validation?.params) {
    validatedInput.params = dataOrThrow(
      parseParams(params, validation.params)
    );
  }

  if (validation?.query) {
    const { searchParams } = new URL(request.url);
    validatedInput.query = dataOrThrow(
      parseQuery(searchParams, validation.query)
    );
  }

  return handler({
    ...appContext,
    request,
    set,
    get signal() {
      return abort.signal;
    },
    ...validatedInput,
  });
};

export const pathnameOf = (url: string): string => {
  const start = url.indexOf("/", url.indexOf("//") + 2);
  if (start === -1) return "/";
  const query = url.indexOf("?", start);
  const fragment = url.indexOf("#", start);
  const end = Math.min(
    query === -1 ? url.length : query,
    fragment === -1 ? url.length : fragment
  );
  return url.slice(start, end);
};

export const invalidHostResponse = (requestId: string): Response =>
  handleError(new InvalidHostError(), requestId);

export const handleError = (error: LynError, requestId: string): Response =>
  Response.json(
    {
      code: error.code,
      message: error.message,
      cause: error.cause,
    },
    {
      status: error.status,
      headers: addRequestHeaders(new Headers(error.headers), requestId),
    }
  );
