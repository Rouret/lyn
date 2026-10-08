import {
  LynEnvError,
  lynEnvConfig,
  parseEnvs,
  type EnvConfig,
  type LynEnv,
} from "#lyn/env";
import { corsFeature } from "#lyn/features/cors";
import {
  databaseFeature,
  LynDatabaseError,
  NO_DATABASE_MESSAGE,
  type DatabaseContext,
  type DatabaseOf,
  type DatabaseSchema,
} from "#lyn/features/database";
import type { Feature } from "#lyn/features/feature";
import { internalLogger, logger } from "#lyn/logger";
import { handleRouteMatch } from "#lyn/request";
import { logRequest, resolveRequestId, runWithRequestLog } from "#lyn/request-log";
import { createRouter } from "#lyn/router";
import { forgetOnShutdownSignal, stopOnShutdownSignal } from "#lyn/shutdown";
import type {
  LynConfig,
  ParamsSchema,
  PotentialAnySchema,
  QuerySchema,
  Route,
  RouteHandler,
  RoutePath,
  Validation,
} from "#lyn/types";
import type { Server } from "bun";
import z from "zod";
import { version as VERSION } from "../package.json";

const DEFAULT_LYN_CONFIG: Pick<LynConfig, "start"> = {
  start: {
    hideLynLogo: false,
  },
};

const BUILT_IN_FEATURES = [databaseFeature, corsFeature];

const ANY_FREE_PORT = 0;
const LOOPBACK_HOST = "127.0.0.1";
const SERVER_IDLE_TIMEOUT_SECONDS = 30;

type ServerStatus = "stopped" | "starting" | "running";

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

class Lyn<
  TEnvConfig extends EnvConfig = {},
  TSchema extends DatabaseSchema | undefined = undefined
> {
  private router = createRouter();
  private server: Server<unknown> | null = null;
  private baseUrl: string | null = null;
  private status: ServerStatus = "stopped";
  private config: LynConfig<TEnvConfig, TSchema>;
  private readonly features: Feature[];
  private readonly appContext: Record<string, unknown>;
  public readonly env: LynEnv<TEnvConfig>;

  constructor(config: LynConfig<TEnvConfig, TSchema> = {}) {
    // TODO: create a lyn.config.ts file to store the config
    const featureSetups = BUILT_IN_FEATURES.map((defineFeature) =>
      defineFeature(config)
    ).filter(isDefined);
    const [env, ...featureEnvs] = parseEnvs(
      { ...lynEnvConfig, ...config.env },
      ...featureSetups.map((setup) => setup.env ?? {})
    );
    this.env = env as LynEnv<TEnvConfig>;

    this.config = {
      ...DEFAULT_LYN_CONFIG,
      ...config,
    };

    internalLogger.info("All environment variables are valid");

    this.features = featureSetups.map((setup, index) =>
      setup.create({ app: this.env, own: featureEnvs[index] ?? {} })
    );
    this.appContext = Object.assign(
      {},
      ...this.features.map((feature) => feature.context)
    );
  }

  /**
   * The Drizzle instance, typed from `database.schema`. Same instance as
   * `ctx.db` in handlers; use it in scripts, seeds and tests.
   */
  get db(): DatabaseOf<TSchema> {
    if (!("db" in this.appContext)) throw new Error(NO_DATABASE_MESSAGE);
    return this.appContext.db as DatabaseOf<TSchema>;
  }

  get<
    TParamsSchema extends ParamsSchema = undefined,
    TQuerySchema extends QuerySchema = undefined
  >(
    path: RoutePath,
    handler: RouteHandler<
      undefined,
      TParamsSchema,
      TQuerySchema,
      DatabaseContext<TSchema>
    >,
    validation?: Validation<undefined, TParamsSchema, TQuerySchema>
  ) {
    this.addRoute({ path, handler, validation, method: "GET" });
    return this;
  }

  post<
    TBodySchema extends PotentialAnySchema = undefined,
    TParamsSchema extends ParamsSchema = undefined,
    TQuerySchema extends QuerySchema = undefined
  >(
    path: RoutePath,
    handler: RouteHandler<
      TBodySchema,
      TParamsSchema,
      TQuerySchema,
      DatabaseContext<TSchema>
    >,
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
    handler: RouteHandler<
      TBodySchema,
      TParamsSchema,
      TQuerySchema,
      DatabaseContext<TSchema>
    >,
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
    handler: RouteHandler<
      TBodySchema,
      TParamsSchema,
      TQuerySchema,
      DatabaseContext<TSchema>
    >,
    validation?: Validation<TBodySchema, TParamsSchema, TQuerySchema>
  ) {
    this.addRoute({ path, handler, validation, method: "PUT" });
    return this;
  }

  private addRoute(route: Route<any, any, any, any>) {
    this.router.add(route);
  }

  private mapError = (error: unknown) => {
    for (const feature of this.features) {
      const mappedError = feature.mapError?.(error);
      if (mappedError) return mappedError;
    }
    return undefined;
  };

  async handle(request: Request): Promise<Response> {
    const startedAt = performance.now();
    const requestId = resolveRequestId(request);
    const requestLogger = internalLogger.child({ requestId });
    const { pathname } = new URL(request.url);

    const routedResponse = await runWithRequestLog(requestLogger, () =>
      handleRouteMatch({
        request,
        pathname,
        match: this.router.match(request.method, pathname),
        log: requestLogger,
        appContext: this.appContext,
        mapError: this.mapError,
      })
    );
    const response = this.features.reduce(
      (current, feature) => feature.onResponse?.(request, current) ?? current,
      routedResponse
    );
    response.headers.set("X-Request-Id", requestId);

    logRequest(requestLogger, {
      method: request.method,
      path: pathname,
      status: response.status,
      durationMs: performance.now() - startedAt,
    });
    return response;
  }

  async listen(port: number = ANY_FREE_PORT): Promise<this> {
    if (typeof Bun === "undefined")
      throw new Error("Lyn can only be used on Bun");
    if (this.status === "running")
      throw new Error(
        `Server is already running on ${this.url}. Call stop() before listening again.`
      );
    if (this.status === "starting")
      throw new Error("Server is already starting.");

    this.status = "starting";
    try {
      for (const feature of this.features) await feature.onStart?.();
    } catch (error) {
      this.status = "stopped";
      throw error;
    }

    this.server = Bun.serve({
      port,
      fetch: (request) => this.handle(request),
      idleTimeout: SERVER_IDLE_TIMEOUT_SECONDS,
    });
    this.status = "running";

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

    this.baseUrl = `http://${LOOPBACK_HOST}:${this.server.port}`;

    stopOnShutdownSignal(this);

    return this;
  }

  get url(): string {
    if (!this.server || !this.baseUrl) {
      throw new Error("Server is not running. Call listen() first.");
    }
    return this.baseUrl;
  }

  async stop() {
    forgetOnShutdownSignal(this);
    if (this.server) {
      await this.server.stop();
      this.server = null;
      this.baseUrl = null;
    }
    this.status = "stopped";
    for (const feature of [...this.features].reverse()) await feature.onStop?.();
  }
}

export { logger, Lyn, LynDatabaseError, LynEnvError, z };
