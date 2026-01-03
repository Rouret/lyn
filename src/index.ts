import { handleRequestLifecycle } from "#/request";
import type {
  BunRoutes,
  ParamsSchema,
  PotentialAnySchema,
  QuerySchema,
  Route,
  RouteHandler,
  RoutePath,
  Validation,
} from "#/types";
import type { BunRequest, Server } from "bun";
import z from "zod";

class Lyn {
  private routes: Route<any, any, any>[] = [];
  private server: Server<unknown> | null = null;
  private baseUrl: string | null = null;

  get<
    TParamsSchema extends ParamsSchema = undefined,
    TQuerySchema extends QuerySchema = undefined
  >(
    path: RoutePath,
    handler: RouteHandler<undefined, TParamsSchema, TQuerySchema>,
    validation?: Validation<undefined, TParamsSchema, TQuerySchema>
  ) {
    this.addRoute({ path, handler, validation: validation, method: "GET" });
    return this;
  }

  post<
    TBodySchema extends PotentialAnySchema = undefined,
    TParamsSchema extends ParamsSchema = undefined,
    TQuerySchema extends QuerySchema = undefined
  >(
    path: RoutePath,
    handler: RouteHandler<TBodySchema, TParamsSchema, TQuerySchema>,
    validation?: Validation<TBodySchema, TParamsSchema, TQuerySchema>
  ) {
    this.addRoute({ path, handler, validation, method: "POST" });
    return this;
  }

  delete<
    TBodySchema extends PotentialAnySchema = undefined,
    TParamsSchema extends ParamsSchema = undefined,
    TQuerySchema extends QuerySchema = undefined
  >(
    path: RoutePath,
    handler: RouteHandler<TBodySchema, TParamsSchema, TQuerySchema>,
    validation?: Validation<TBodySchema, TParamsSchema, TQuerySchema>
  ) {
    this.addRoute({ path, handler, validation, method: "DELETE" });
    return this;
  }

  put<
    TBodySchema extends PotentialAnySchema = undefined,
    TParamsSchema extends ParamsSchema = undefined,
    TQuerySchema extends QuerySchema = undefined
  >(
    path: RoutePath,
    handler: RouteHandler<TBodySchema, TParamsSchema, TQuerySchema>,
    validation?: Validation<TBodySchema, TParamsSchema, TQuerySchema>
  ) {
    this.addRoute({ path, handler, validation, method: "PUT" });
    return this;
  }

  private addRoute(route: Route<any, any, any>) {
    if (route.path === "") {
      this.stop();
      throw new Error("Route path cannot be empty");
    }
    this.routes.push(route);
  }

  listen(port: number = 0) {
    if (typeof Bun === "undefined")
      throw new Error("Lyn can only be used on Bun");

    const bunRoutes: BunRoutes = this.routes.reduce((acc, route) => {
      const handler = async (request: BunRequest): Promise<Response> =>
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

    this.baseUrl = `http://127.0.0.1:${this.server.port}`;

    process.on("beforeExit", async () => {
      this.stop();
    });

    return this;
  }

  get url(): string {
    if (!this.server || !this.baseUrl) {
      throw new Error("Server is not running. Call listen() first.");
    }
    return this.baseUrl;
  }

  async stop() {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
  }
}

export { Lyn, z };
