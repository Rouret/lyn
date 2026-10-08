import {
  InternalServerError,
  isLynError,
  LynError,
  MethodNotAllowedError,
  NotFoundError,
  ValidationError,
} from "#/error";
import { internalLogger } from "#/logger";
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

/*        | ---------handleRequestLifecycle----------|
 Request -> handleRequest -> handler -> handleResponse -> Response
                 | (on error)                          |
                  -> handleError ----------------------
 */
export const handleRouteMatch = (
  request: Request,
  pathname: string,
  match: RouteMatch
): Promise<Response> | Response => {
  switch (match.status) {
    case "found":
      return handleRequestLifecycle(request, match.route, match.params);
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
  params: Record<string, string>
): Promise<Response> => {
  try {
    const set: SetDefinition = {
      headers: new Headers(),
      status: getDefaultStatusFromMethod(route.method),
    };

    internalLogger.info(
      `Handle request: ${request.method} on ${new URL(request.url).pathname}`
    );

    const responseBody = await handleRequest(
      request,
      params,
      route.handler,
      set,
      route.validation
    );

    const response = handleResponse(responseBody, set.headers, set.status);
    internalLogger.info(
      `Return response: ${response.status} for ${request.method} on ${
        new URL(request.url).pathname
      }`
    );
    return response;
  } catch (error: unknown) {
    if (isLynError(error)) {
      return handleError(error);
    }
    internalLogger.error(error);
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
  //TODO: CORS headers
  headers.set("Access-Control-Allow-Origin", "*");

  if (bodyResponse === undefined) {
    return new Response(null, { headers, status });
  }

  if (typeof bodyResponse === "string") {
    setDefaultContentType(headers, "text/plain");
    return new Response(bodyResponse, { headers, status });
  }

  setDefaultContentType(headers, "application/json");
  return Response.json(bodyResponse, { headers, status });
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
  //@ts-expect-error - We need to assign the body, params and query to the context later
  const context: Context<TBodySchema, TParamsSchema, TQuerySchema> = {
    request,
    set,
    body: undefined,
    params: undefined,
    query: undefined,
  };

  // Valifation Step
  // Body Validation
  if (validation?.body) {
    const body = await readJsonBody(request);
    const { error, data } = validation.body.safeParse(body);
    if (error) {
      throw new ValidationError(error);
    }

    context.body = data;
  }

  // Params Validation
  if (validation?.params) {
    const { error, data } = parseParams(params, validation.params);
    if (error) {
      throw new ValidationError(error);
    }
    context.params = data;
  }

  // Query Validation
  if (validation?.query) {
    const { searchParams } = new URL(request.url);
    const { error, data } = parseQuery(searchParams, validation.query);
    if (error) {
      throw new ValidationError(error);
    }
    context.query = data;
  }

  return routeHandler(context);
};

const handleError = (error: LynError): Response => {
  internalLogger.error(
    `Handle error: ${error.code} - ${error.message} return status ${error.status}`
  );
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
