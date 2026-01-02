import {
  InternalServerError,
  LynError,
  NoBodyError,
  NoParamsError,
  ValidationError,
} from "#/error";
import type {
  Context,
  ParamsSchema,
  PotentialAnySchema,
  Route,
  RouteHandler,
  RouteHandlerBodyResponse,
  SetDefinition,
  Validation,
} from "#/types";
import { getDefaultStatusFromMethod } from "#/utils";
import type { BunRequest } from "bun";

/*
 Request -> handleRequest -> handler -> handleResponse -> Response
                 | (on error)                          |
                  -> handleError ----------------------
 */
export const handleRequestLifecycle = async (
  request: BunRequest,
  route: Route
): Promise<Response> => {
  try {
    const set: SetDefinition = {
      headers: new Headers(),
      status: getDefaultStatusFromMethod(route.method),
    };

    const responseBody = await handleRequest(
      request,
      route.handler,
      set,
      route.validation
    );

    return handleResponse(responseBody, set.headers, set.status);
  } catch (error: any) {
    // If the error is a LynError, throw it
    if (error["isLynError"]) {
      return handleError(error as LynError);
    }
    // Else, send Internal Server Error and log the error
    //TODO : LOGGER
    console.error(error);
    return handleError(new InternalServerError());
  }
};

export const handleFormattedBody = (
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

export const handleResponse = (
  bodyResponse: RouteHandlerBodyResponse,
  headers: Headers,
  status: number
): Response => {
  const contentType = getContentTypeFromBodyResponse(bodyResponse);
  const payload = handleFormattedBody(bodyResponse);

  headers.set("Content-Type", contentType);

  return new Response(payload, {
    headers: headers,
    status: status,
  });
};

export const handleRequest = async <
  TBodySchema extends PotentialAnySchema,
  TParamsSchema extends ParamsSchema
>(
  request: BunRequest,
  routeHandler: RouteHandler<TBodySchema, TParamsSchema>,
  set: SetDefinition,
  validation?: Validation<TBodySchema, TParamsSchema>
): Promise<RouteHandlerBodyResponse> => {
  //@ts-expect-error - We need to assign the body and params to the context later
  const context: Context<TBodySchema, TParamsSchema> = {
    request,
    set,
    body: undefined,
    params: undefined,
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
    if (Object.keys(request.params).length === 0) {
      throw new NoParamsError();
    }

    const params = request.params;
    const { error, data } = validation.params.safeParse(params);
    if (error) {
      throw new ValidationError(error);
    }
    context.params = data;
  }
  return routeHandler(context);
};

export const handleError = (error: LynError): Response => {
  return new Response(
    JSON.stringify({ code: error.code, message: error.message }),
    {
      status: error.status,
    }
  );
};
