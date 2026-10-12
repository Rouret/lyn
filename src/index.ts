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
import type { ClientInfo, Feature } from "#lyn/features/feature";
import { rateLimitFeature } from "#lyn/features/rate-limit";
import { resolveMaxBodyBytes } from "#lyn/body";
import { isRequestHostAllowed, resolveAllowedHosts } from "#lyn/host";
import { internalLogger, logger } from "#lyn/logger";
import {
  handleError,
  handleRouteMatch,
  invalidHostResponse,
  resolveRequestTimeoutMs,
} from "#lyn/request";
import { InternalServerError, isLynError } from "#lyn/error";
import {
  errorForLog,
  logRequest,
  resolveRequestId,
  runWithRequestLog,
  type RequestLogger,
} from "#lyn/request-log";
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

const BUILT_IN_FEATURES = [databaseFeature, corsFeature, rateLimitFeature];

const ANY_FREE_PORT = 0;
const LOOPBACK_HOST = "127.0.0.1";
const SERVER_IDLE_TIMEOUT_SECONDS = 30;
const WILDCARD_BIND_HOSTS = new Set(["0.0.0.0", "::"]);

const advertisedHost = (hostname: string) =>
  WILDCARD_BIND_HOSTS.has(hostname) ? LOOPBACK_HOST : hostname;

const formatHttpHost = (hostname: string) =>
  hostname.includes(":") ? `[${hostname}]` : hostname;

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
  private readonly allowedHosts: ReadonlySet<string>;
  private readonly maxBodyBytes: number;
  private readonly requestTimeoutMs: number;
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
    this.allowedHosts = resolveAllowedHosts(
      this.config.server?.hostname ?? LOOPBACK_HOST,
      this.config.server?.allowedHosts
    );
    this.maxBodyBytes = resolveMaxBodyBytes(this.config.server?.maxBodyBytes);
    this.requestTimeoutMs = resolveRequestTimeoutMs(this.config.server?.requestTimeoutMs);

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

  handle(request: Request): Promise<Response> {
    return this.dispatch(request, { ip: undefined });
  }

  private rejectRequest = async (
    request: Request,
    client: ClientInfo,
    requestLogger: RequestLogger
  ) => {
    try {
      for (const feature of this.features) {
        const rejection = await feature.onRequest?.(request, client);
        if (rejection) return rejection;
      }
      return undefined;
    } catch (error: unknown) {
      if (isLynError(error)) return error;
      requestLogger.error(errorForLog(error), "Unhandled error before routing");
      return new InternalServerError();
    }
  };

  private isHostAllowed(request: Request) {
    const servedPort = this.server?.port;
    return (
      servedPort === undefined ||
      isRequestHostAllowed(request, this.allowedHosts, servedPort)
    );
  }

  private async route(
    request: Request,
    client: ClientInfo,
    pathname: string,
    requestLogger: RequestLogger
  ): Promise<Response> {
    if (!this.isHostAllowed(request)) return invalidHostResponse();

    const rejection = await this.rejectRequest(request, client, requestLogger);
    if (rejection) return handleError(rejection);

    return runWithRequestLog(requestLogger, () =>
      handleRouteMatch({
        request,
        pathname,
        match: this.router.match(request.method, pathname),
        log: requestLogger,
        appContext: this.appContext,
        mapError: this.mapError,
        maxBodyBytes: this.maxBodyBytes,
        requestTimeoutMs: this.requestTimeoutMs,
      })
    );
  }

  private async dispatch(request: Request, client: ClientInfo): Promise<Response> {
    const startedAt = performance.now();
    const requestId = resolveRequestId(request);
    const requestLogger = internalLogger.child({ requestId });
    const { pathname } = new URL(request.url);
    const routedResponse = await this.route(request, client, pathname, requestLogger);
    const response = this.features.reduce(
      (current, feature) => feature.onResponse?.(request, current) ?? current,
      routedResponse
    );
    response.headers.set("X-Request-Id", requestId);
    if (!response.headers.has("X-Content-Type-Options"))
      response.headers.set("X-Content-Type-Options", "nosniff");

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

    const hostname = this.config.server?.hostname ?? LOOPBACK_HOST;
    if (hostname.trim() === "")
      throw new Error("server.hostname must be a non-empty host");

    this.status = "starting";
    try {
      for (const feature of this.features) await feature.onStart?.();
    } catch (error) {
      this.status = "stopped";
      throw error;
    }

    this.server = Bun.serve({
      hostname,
      port,
      maxRequestBodySize: this.maxBodyBytes,
      fetch: (request, server) =>
        this.dispatch(request, { ip: server.requestIP(request)?.address }),
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

    this.baseUrl = `http://${formatHttpHost(advertisedHost(hostname))}:${this.server.port}`;

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
