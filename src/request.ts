import { LynError, NoBodyError, ValidationError } from "#/error";
import type {
  Context,
  PotentialAnySchema,
  RouteHandler,
  RouteHandlerBodyResponse,
  SetDefinition,
  Validation,
} from "#/types";

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

export const handleRequest = async <TSchema extends PotentialAnySchema>(
  request: Request,
  routeHandler: RouteHandler<TSchema>,
  set: SetDefinition,
  validation?: Validation<TSchema>
): Promise<RouteHandlerBodyResponse> => {
  // Valifation Step
  if (validation?.body) {
    if (!request.body) {
      throw new NoBodyError();
    }

    const body = await request.body.json();
    const { error, data } = validation.body.safeParse(body);
    if (error) {
      throw new ValidationError(error);
    }

    const context = { request, body: data, set } as Context<TSchema>;
    return routeHandler(context);
  }

  const context = { request, set } as Context<TSchema>;
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
