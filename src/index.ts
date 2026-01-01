import type { ZodType } from "zod";

type Context = {
  request: Request;
  body?: unknown;
};

type RouteHandler = (ctx: Context) => Response;
type RoutePath = string;
type Route = {
  path: RoutePath;
  handler: RouteHandler;
  validation?: Validation;
};

type Validation = {
  body?: ZodType;
};

const onRequest = async (
  request: Request,
  routeHandler: RouteHandler,
  validation?: Validation
): Promise<Response> => {
  const context: Context = {
    request: request,
    body: undefined,
  };

  if (validation?.body && request.body) {
    const body = await request.body.json();
    const { error, data } = validation.body.safeParse(body);
    if (error) {
      return new Response(error.message, { status: 400 });
    }
    context.body = data;
  }

  return routeHandler(context);
};

export class Lyn {
  private routes: Route[] = [];

  get(path: RoutePath, handler: RouteHandler) {
    this.routes.push({ path, handler, validation: undefined });
    return this;
  }

  post(path: RoutePath, handler: RouteHandler, validation?: Validation) {
    this.routes.push({ path, handler, validation });
    return this;
  }

  put(path: RoutePath, handler: RouteHandler, validation?: Validation) {
    this.routes.push({ path, handler, validation });
    return this;
  }

  delete(path: RoutePath, handler: RouteHandler, validation?: Validation) {
    this.routes.push({ path, handler, validation });
    return this;
  }

  listen(port: number) {
    const bunRoutes: Record<
      RoutePath,
      (request: Request) => Promise<Response>
    > = this.routes.reduce((acc, route) => {
      // The value is the function called by Bun to handle the request
      acc[route.path] = (request: Request): Promise<Response> =>
        onRequest(request, route.handler, route.validation);
      return acc;
    }, {} as Record<RoutePath, (request: Request) => Promise<Response>>);

    Bun.serve({
      port,
      routes: bunRoutes,
    });
    console.log(`Server is running on port ${port}`);
  }
}
