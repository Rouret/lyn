import {
  InternalServerError,
  isLynError,
  LynError,
  MethodNotAllowedError,
  NotFoundError,
  ValidationError,
} from "#/error";
import type { RequestLogger } from "#/request-log";
import type {
  Context,
  ParamsSchema,
  PotentialAnySchema,
  QuerySchema,
  Route,
  RouteHandler,
  RouteHandlerBodyResponse,
  SetDefinition,
  Validation,
} from "#/types";
import { readJsonBody } from "#/body";
import { parseParams } from "#/params";
import { parseQuery } from "#/query";
import type { RouteMatch } from "#/router";
import { getDefaultStatusFromMethod } from "#/utils";
import type { ZodSafeParseResult } from "zod";

/*        | ---------handleRequestLifecycle----------|
 Request -> handleRequest -> handler -> handleResponse -> Response
                 | (on error)                          |
                  -> handleError ----------------------
 */
export const handleRouteMatch = (
  request: Request,
  pathname: string,
  match: RouteMatch,
  log: RequestLogger
): Promise<Response> | Response => {
  switch (match.status) {
    case "found":
      return handleRequestLifecycle(request, match.route, match.params, log);
    case "method_not_allowed":
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
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
  route: Route,
  params: Record<string, string>,
  log: RequestLogger
): Promise<Response> => {
  try {
    const set: SetDefinition = {
      headers: new Headers(),
      status: getDefaultStatusFromMethod(route.method),
    };

    const responseBody = await handleRequest(
      request,
      params,
      route.handler,
      set,
      route.validation
    );

    return handleResponse(responseBody, set.headers, set.status);
  } catch (error: unknown) {
    if (isLynError(error)) {
      return handleError(error);
    }
    log.error({ err: error }, "Unhandled error in route handler");
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

const dataOrThrow = <T>(result: ZodSafeParseResult<T>): T => {
  if (!result.success) throw new ValidationError(result.error);
  return result.data;
};

const handleRequest = async <
  TBodySchema extends PotentialAnySchema,
  TParamsSchema extends ParamsSchema,
  TQuerySchema extends QuerySchema
>(
  request: Request,
  params: Record<string, string>,
  routeHandler: RouteHandler<TBodySchema, TParamsSchema, TQuerySchema>,
  set: SetDefinition,
  validation?: Validation<TBodySchema, TParamsSchema, TQuerySchema>
): Promise<RouteHandlerBodyResponse> => {
  const validatedInput: { body?: unknown; params?: unknown; query?: unknown } =
    {};

  if (validation?.body) {
    const body = await readJsonBody(request);
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

  const context = { request, set, ...validatedInput } as Context<
    TBodySchema,
    TParamsSchema,
    TQuerySchema
  >;
  return routeHandler(context);
};

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
