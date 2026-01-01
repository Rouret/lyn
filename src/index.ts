import z, { ZodType } from "zod";

type AnySchema = ZodType<any, any, any>;
type PotentialAnySchema = AnySchema | undefined;

type Context<TBodySchema extends PotentialAnySchema> =
  TBodySchema extends AnySchema
    ? {
        request: Request;
        body: z.infer<TBodySchema>;
      }
    : {
        request: Request;
      };

type Validation<TBodySchema extends PotentialAnySchema = undefined> = {
  body?: TBodySchema;
};

type RouteHandler<TBodySchema extends PotentialAnySchema = undefined> = (
  ctx: Context<TBodySchema>
) => Response;
type RoutePath = string;
type Route<TBodySchema extends PotentialAnySchema = undefined> = {
  path: RoutePath;
  handler: RouteHandler<TBodySchema>;
  validation?: Validation<TBodySchema>;
};

async function onRequest<TSchema extends PotentialAnySchema>(
  request: Request,
  routeHandler: RouteHandler<TSchema>,
  validation?: Validation<TSchema>
): Promise<Response> {
  if (validation?.body && request.body) {
    const body = await request.body.json();
    const { error, data } = validation.body.safeParse(body);
    if (error) return new Response(error.message, { status: 400 });

    const context = { request, body: data } as Context<TSchema>;
    return routeHandler(context);
  }

  const context = { request } as Context<TSchema>;
  return routeHandler(context);
}

export class Lyn {
  private routes: Route<any>[] = [];

  get(path: RoutePath, handler: RouteHandler) {
    this.routes.push({ path, handler, validation: undefined });
    return this;
  }

  post<TSchema extends PotentialAnySchema = undefined>(
    path: RoutePath,
    handler: RouteHandler<TSchema>,
    validation?: Validation<TSchema>
  ) {
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
