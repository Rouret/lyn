import {
  InternalServerError,
  LynError,
  NoBodyError,
  NoParamsError,
  NoQueryError,
  ValidationError,
} from "#/error";
import type {
  Context,
  ParamsSchema,
  PotentialAnySchema,
  QueryInfer,
  QuerySchema,
  Route,
  RouteHandler,
  RouteHandlerBodyResponse,
  SetDefinition,
  Validation,
} from "#/types";
import { getDefaultStatusFromMethod } from "#/utils";
import type { BunRequest } from "bun";
import { record, ZodBoolean, ZodNumber, ZodString } from "zod";

/*        | ---------handleRequestLifecycle----------|
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
  const payload = handleFormattedBody(bodyResponse);

  headers.set("Content-Type", contentType);

  return new Response(payload, {
    headers: headers,
    status: status,
  });
};

const handleRequest = async <
  TBodySchema extends PotentialAnySchema,
  TParamsSchema extends ParamsSchema,
  TQuerySchema extends QuerySchema
>(
  request: BunRequest,
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

  // Query Validation
  if (validation?.query) {
    const searchParams = new URL(request.url).searchParams;
    if (searchParams.size === 0) {
      throw new NoQueryError();
    }

    const out: Record<string, QueryInfer> = {};

    for (const key in validation.query.shape) {
      const field = validation.query.shape[key];
      if (!field) continue;

      const values = searchParams.getAll(key);
      if (values.length !== 1) continue;

      const value = values[0] as string;

      if (field instanceof ZodString) {
        out[key] = value;
      } else if (field instanceof ZodNumber) {
        out[key] = Number(value);
      } else if (field instanceof ZodBoolean) {
        out[key] = value === "true" || value === "1";
      }
    }

    console.log(out);

    context.query = out;
  }

  return routeHandler(context);
};

const handleError = (error: LynError): Response => {
  return new Response(
    JSON.stringify({
      code: error.code,
      message: error.message,
      cause: error.cause,
    }),
    {
      status: error.status,
    }
  );
};
