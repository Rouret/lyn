import type {
  Context,
  PotentialAnySchema,
  RouteHandler,
  RouteHandlerResponse,
  SetDefinition,
  Validation,
} from "#/types";

export const handleFormattedBody = (
  handlerResponse: RouteHandlerResponse
): string => {
  if (typeof handlerResponse === "string") {
    return handlerResponse;
  }
  return JSON.stringify(handlerResponse);
};

export const handleResponse = (
  handlerResponse: RouteHandlerResponse,
  headers: Headers,
  status: number
): Response => {
  //TODO: update content type if needed
  return new Response(handleFormattedBody(handlerResponse), {
    headers: headers,
    status: status,
  });
};

export const handleRequest = async <TSchema extends PotentialAnySchema>(
  request: Request,
  routeHandler: RouteHandler<TSchema>,
  set: SetDefinition,
  validation?: Validation<TSchema>
): Promise<RouteHandlerResponse | Response> => {
  // Valifation Step
  if (validation?.body && request.body) {
    const body = await request.body.json();
    const { error, data } = validation.body.safeParse(body);
    if (error) return new Response(error.message, { status: 400 });

    const context = { request, body: data, set } as Context<TSchema>;
    return routeHandler(context);
  }

  const context = { request, set } as Context<TSchema>;
  return routeHandler(context);
};
