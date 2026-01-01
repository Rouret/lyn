import { handleRequest, handleResponse } from "#/request";
import type {
  BunRoutes,
  PotentialAnySchema,
  Route,
  RouteHandler,
  RoutePath,
  SetDefinition,
  Validation,
} from "#/types";
import type { Server } from "bun";

export class Lyn {
  private routes: Route<any>[] = [];
  private server: Server<unknown> | null = null;

  get(path: RoutePath, handler: RouteHandler) {
    this.routes.push({ path, handler, validation: undefined, method: "GET" });
    return this;
  }

  post<TSchema extends PotentialAnySchema = undefined>(
    path: RoutePath,
    handler: RouteHandler<TSchema>,
    validation?: Validation<TSchema>
  ) {
    this.routes.push({ path, handler, validation, method: "POST" });
    return this;
  }

  delete<TSchema extends PotentialAnySchema = undefined>(
    path: RoutePath,
    handler: RouteHandler<TSchema>,
    validation?: Validation<TSchema>
  ) {
    this.routes.push({ path, handler, validation, method: "DELETE" });
    return this;
  }

  put<TSchema extends PotentialAnySchema = undefined>(
    path: RoutePath,
    handler: RouteHandler<TSchema>,
    validation?: Validation<TSchema>
  ) {
    this.routes.push({ path, handler, validation, method: "PUT" });
    return this;
  }

  listen(port: number) {
    if (typeof Bun === "undefined")
      throw new Error("Lyn can only be used on Bun");

    const bunRoutes: BunRoutes = this.routes.reduce((acc, route) => {
      const handler = async (request: Request): Promise<Response> => {
        const set: SetDefinition = {
          headers: new Headers({ "Content-Type": "application/json" }),
          status: 200,
        };
        const response = await handleRequest(
          request,
          route.handler,
          set,
          route.validation
        );

        //Error from request lifecycle
        if (response instanceof Response) {
          return response;
        }

        return handleResponse(response, set.headers, set.status);
      };

      acc[route.path] ??= {};

      acc[route.path]![route.method] = handler;

      return acc;
    }, {} as BunRoutes);

    this.server = Bun.serve({
      port,
      routes: bunRoutes,
      reusePort: true,
      idleTimeout: 30,
    });

    process.on("beforeExit", async () => {
      this.stop();
    });

    return this;
  }

  async stop() {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }
}
