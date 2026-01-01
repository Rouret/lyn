import type {
  PotentialAnySchema,
  RouteHandler,
  Validation,
  Context,
  Route,
  RoutePath,
} from "#/types";
import type { Server } from "bun";

const handleResponse = (response: Response): Response => {
  response.headers.set("Content-Type", "application/json");
  return response;
};

const handleRequest = async <TSchema extends PotentialAnySchema>(
  request: Request,
  routeHandler: RouteHandler<TSchema>,
  validation?: Validation<TSchema>
): Promise<Response> => {
  // Valifation Step
  if (validation?.body && request.body) {
    const body = await request.body.json();
    const { error, data } = validation.body.safeParse(body);
    if (error) return new Response(error.message, { status: 400 });

    const context = { request, body: data } as Context<TSchema>;
    return routeHandler(context);
  }

  const context = { request } as Context<TSchema>;
  return routeHandler(context);
};

export class Lyn {
  private routes: Route<any>[] = [];
  private server: Server<unknown> | null = null;

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
      acc[route.path] = async (request: Request): Promise<Response> => {
        const response = await handleRequest(
          request,
          route.handler,
          route.validation
        );

        return handleResponse(response);
      };
      return acc;
    }, {} as Record<RoutePath, (request: Request) => Promise<Response>>);

    this.server = Bun.serve({
      port,
      routes: bunRoutes,
      reusePort: true,
      idleTimeout: 30,
    });

    process.on("beforeExit", async () => {
      if (this.server) {
        await this.server.stop?.();
        this.server = null;
      }
    });
  }
}
