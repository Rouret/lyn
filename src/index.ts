import { internalLogger, logger } from "#/logger";
import { handleRouteMatch } from "#/request";
import { createRouter } from "#/router";
import type {
  LynConfig,
  ParamsSchema,
  PotentialAnySchema,
  QuerySchema,
  Route,
  RouteHandler,
  RoutePath,
  Validation,
} from "#/types";
import type { Server } from "bun";
import z from "zod";
import packageJson from "../package.json";
import {
  LynEnvError,
  lynEnvConfig,
  parseEnv,
  type EnvConfig,
  type LynEnv,
} from "#/env";
import { applyCors, assertValidCorsConfig } from "#/cors";

const VERSION = packageJson.version as string;

const DEFAULT_LYN_CONFIG: Pick<LynConfig, "start"> = {
  start: {
    hideLynLogo: false,
  },
};

class Lyn<TEnvConfig extends EnvConfig = {}> {
  private router = createRouter();
  private server: Server<unknown> | null = null;
  private baseUrl: string | null = null;
  private config: LynConfig<TEnvConfig>;
  public readonly env: LynEnv<TEnvConfig>;

  constructor(config: LynConfig<TEnvConfig> = {}) {
    // TODO: create a lyn.config.ts file to store the config
    this.env = parseEnv({
      ...lynEnvConfig,
      ...config.env,
    }) as LynEnv<TEnvConfig>;

    this.config = {
      ...DEFAULT_LYN_CONFIG,
      ...config,
    };

    internalLogger.info("All environment variables are valid");

    if (this.config.cors) assertValidCorsConfig(this.config.cors);
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
    this.router.add(route);
  }

  async handle(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const response = await handleRouteMatch(
      request,
      pathname,
      this.router.match(request.method, pathname)
    );
    return this.config.cors
      ? applyCors(request, response, this.config.cors)
      : response;
  }

  listen(port: number = 0) {
    if (typeof Bun === "undefined")
      throw new Error("Lyn can only be used on Bun");
    if (this.server)
      throw new Error(
        `Server is already running on ${this.url}. Call stop() before listening again.`
      );

    this.server = Bun.serve({
      port,
      fetch: (request) => this.handle(request),
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

    process.on("beforeExit", this.stopOnExit);

    return this;
  }

  get url(): string {
    if (!this.server || !this.baseUrl) {
      throw new Error("Server is not running. Call listen() first.");
    }
    return this.baseUrl;
  }

  private stopOnExit = () => {
    internalLogger.warn("Server is shutting down");
    this.stop();
  };

  async stop() {
    process.off("beforeExit", this.stopOnExit);
    if (this.server) {
      await this.server.stop();
      this.server = null;
      this.baseUrl = null;
    }
  }
}

export { logger, Lyn, LynEnvError, z };
