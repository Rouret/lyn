import {
  InternalServerError,
  isLynError,
  LynError,
  MethodNotAllowedError,
  NoBodyError,
  NotFoundError,
  NoParamsError,
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

const handleFormattedBody = (
  handlerResponse: RouteHandlerBodyResponse
): string => {
  if (typeof handlerResponse === "string") {
    return handlerResponse;
  }
  return JSON.stringify(handlerResponse);
};

const getContentTypeFromBodyResponse = (
  bodyResponse: RouteHandlerBodyResponse
): string => {
  if (typeof bodyResponse === "string") { 
    return "text/plain";
  }
  return "application/json";
};

const handleResponse = (
  bodyResponse: RouteHandlerBodyResponse,
  headers: Headers,
  status: number
): Response => {
  const contentType = getContentTypeFromBodyResponse(bodyResponse);

  headers.set("Content-Type", contentType);
  //TODO: CORS headers
  headers.set("Access-Control-Allow-Origin", "*");

  if (contentType === "application/json") {
    return Response.json(bodyResponse, {
      headers: headers,
      status: status,
    });
  }

  return new Response(handleFormattedBody(bodyResponse), {
    headers: headers,
    status: status,
  });
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
    if (!request.body) {
      throw new NoBodyError();
    }

    const body = await request.body.json();
    const { error, data } = validation.body.safeParse(body);
    if (error) {
      throw new ValidationError(error);
    }

    context.body = data;
  }

  // Params Validation
  if (validation?.params) {
    if (Object.keys(params).length === 0) {
      throw new NoParamsError();
    }

    const { error, data } = validation.params.safeParse(params);
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
