import { handleRequestLifecycle } from "#/request";
import type {
  BunRoutes,
  PotentialAnySchema,
  Route,
  RouteHandler,
  RoutePath,
  Validation,
} from "#/types";
import type { Server } from "bun";

export class Lyn {
  private routes: Route<any>[] = [];
  private server: Server<unknown> | null = null;

  get(path: RoutePath, handler: RouteHandler) {
    this.addRoute({ path, handler, validation: undefined, method: "GET" });
    return this;
  }

  post<TSchema extends PotentialAnySchema = undefined>(
    path: RoutePath,
    handler: RouteHandler<TSchema>,
    validation?: Validation<TSchema>
  ) {
    this.addRoute({ path, handler, validation, method: "POST" });
    return this;
  }

  delete<TSchema extends PotentialAnySchema = undefined>(
    path: RoutePath,
    handler: RouteHandler<TSchema>,
    validation?: Validation<TSchema>
  ) {
    this.addRoute({ path, handler, validation, method: "DELETE" });
    return this;
  }

  put<TSchema extends PotentialAnySchema = undefined>(
    path: RoutePath,
    handler: RouteHandler<TSchema>,
    validation?: Validation<TSchema>
  ) {
    this.addRoute({ path, handler, validation, method: "PUT" });
    return this;
  }

  private addRoute(route: Route<any>) {
    if (route.path === "") {
      this.stop();
      throw new Error("Route path cannot be empty");
    }
    this.routes.push(route);
  }

  listen(port: number) {
    if (typeof Bun === "undefined")
      throw new Error("Lyn can only be used on Bun");

    const bunRoutes: BunRoutes = this.routes.reduce((acc, route) => {
      const handler = async (request: Request): Promise<Response> =>
        handleRequestLifecycle(request, route);

      acc[route.path] ??= {};

      acc[route.path]![route.method] = handler;

      return acc;
    }, {} as BunRoutes);

    this.server = Bun.serve({
      port,
      routes: bunRoutes,
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
