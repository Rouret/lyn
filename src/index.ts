import { internalLogger, logger } from "#/logger";
import { handleRequestLifecycle } from "#/request";
import type {
  BunRoutes,
  LynConfig,
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
import packageJson from "../package.json";
import { getEnvConfig, lynEnvConfig, type LynEnv } from "#/env";

const VERSION = packageJson.version as string;

const DEFAULT_LYN_CONFIG: LynConfig = {
  start: {
    hideLynLogo: false,
  },
};

class Lyn {
  public static instance: Lyn | null = null;
  private routes: Route<any, any, any>[] = [];
  private server: Server<unknown> | null = null;
  private baseUrl: string | null = null;
  private config: LynConfig = DEFAULT_LYN_CONFIG;
  public envConfig: LynEnv;

  constructor(config: LynConfig = DEFAULT_LYN_CONFIG) {
    // getEnvConfig exits if env is missing
    // TODO: create a lyn.config.ts file to store the config
    this.envConfig = getEnvConfig({
      ...lynEnvConfig,
      ...(config.env ?? {}),
    });

    this.config = {
      ...DEFAULT_LYN_CONFIG,
      ...config,
    };

    internalLogger.info("All environment variables are valid");

    if (Lyn.instance && this.envConfig.env !== "test") {
      throw new Error("Lyn can only be used once. Use listen() only once.");
    }
    Lyn.instance = this;
  }

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

    if (!this.config.start?.hideLynLogo) {
      console.log(`
█████                            
░░███                             
 ░███        █████ ████ ████████  
 ░███       ░░███ ░███ ░░███░░███ 
 ░███        ░███ ░███  ░███ ░███ 
 ░███      █ ░███ ░███  ░███ ░███ 
 ███████████ ░░███████  ████ █████
░░░░░░░░░░░   ░░░░░███ ░░░░ ░░░░░ 
              ███ ░███            
             ░░██████             
              ░░░░░░      v${VERSION}        
              `);
    }

    internalLogger.info(`Server is running on port ${this.server.port}`);

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

export { logger, Lyn, z };
