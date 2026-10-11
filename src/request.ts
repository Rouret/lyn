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
import { errorForLog, type RequestLogger } from "#lyn/request-log";
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
  appContext,
  mapError,
  maxBodyBytes,
  requestTimeoutMs,
}: RequestDispatch): Promise<Response> | Response => {
  switch (match.status) {
    case "found":
      return handleRequestLifecycle(request, match.route, match.params, {
        log,
        appContext,
        mapError,
        maxBodyBytes,
        requestTimeoutMs,
      });
    case "method_not_allowed":
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: HTTP_STATUS.NO_CONTENT,
          headers: { Allow: [...match.allowedMethods, "OPTIONS"].join(", ") },
        });
      }
      return handleError(
        new MethodNotAllowedError(request.method, pathname, match.allowedMethods)
      );
    case "not_found":
      return handleError(new NotFoundError(request.method, pathname));
  }
};

const handleRequestLifecycle = async (
  request: Request,
  route: AnyRoute,
  params: Record<string, string>,
  {
    log,
    appContext,
    mapError,
    maxBodyBytes,
    requestTimeoutMs,
  }: Pick<
    RequestDispatch,
    "log" | "appContext" | "mapError" | "maxBodyBytes" | "requestTimeoutMs"
  >
): Promise<Response> => {
  try {
    const set: SetDefinition = {
      headers: new Headers(),
      status: getDefaultStatusFromMethod(route.method),
    };

    const responseBody = await withTimeout(
      handleRequest(request, params, route, {
        set,
        appContext,
        maxBodyBytes,
      }),
      requestTimeoutMs
    );

    return handleResponse(responseBody, set.headers, set.status);
  } catch (error: unknown) {
    if (isLynError(error)) {
      return handleError(error);
    }
    const mappedError = mapError(error);
    if (mappedError) {
      log.warn(errorForLog(error), `Handler error mapped to ${mappedError.code}`);
      return handleError(mappedError);
    }
    log.error(errorForLog(error), "Unhandled error in route handler");
    return handleError(new InternalServerError());
  }
};

const setDefaultContentType = (headers: Headers, contentType: string) => {
  if (!headers.has("Content-Type")) headers.set("Content-Type", contentType);
};

const handleResponse = (
  bodyResponse: RouteHandlerBodyResponse,
  headers: Headers,
  status: number
): Response => {
  if (bodyResponse === undefined) {
    return new Response(null, { headers, status });
  }

  if (typeof bodyResponse === "string") {
    setDefaultContentType(headers, "text/plain; charset=utf-8");
    return new Response(bodyResponse, { headers, status });
  }

  setDefaultContentType(headers, "application/json");
  return Response.json(bodyResponse, { headers, status });
};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export const resolveRequestTimeoutMs = (value: number | undefined): number => {
  if (value === undefined) return DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isInteger(value) || value <= 0)
    throw new Error("server.requestTimeoutMs must be a positive integer");
  return value;
};

const withTimeout = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestTimeoutError()), timeoutMs);
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

const handleRequest = async (
  request: Request,
  params: Record<string, string>,
  { handler, validation }: AnyRoute,
  {
    set,
    appContext,
    maxBodyBytes,
  }: { set: SetDefinition; appContext: Record<string, unknown>; maxBodyBytes: number }
): Promise<RouteHandlerBodyResponse> => {
  const validatedInput: { body?: unknown; params?: unknown; query?: unknown } =
    {};

  if (validation?.body) {
    const body = await readJsonBody(request, maxBodyBytes);
    validatedInput.body = dataOrThrow(validation.body.safeParse(body));
  }

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

  return handler({ ...appContext, request, set, ...validatedInput });
};

export const invalidHostResponse = (): Response => handleError(new InvalidHostError());

const handleError = (error: LynError): Response => {
  return Response.json(
    {
      code: error.code,
      message: error.message,
      cause: error.cause,
    },
    {
      status: error.status,
      headers: error.headers,
    }
  );
};
