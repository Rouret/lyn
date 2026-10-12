import type { EnvConfig, LynEnv } from "#lyn/env";
import type { CorsConfig } from "#lyn/features/cors";
import type { DatabaseConfig, DatabaseSchema } from "#lyn/features/database";

import z, { ZodType } from "zod";

/* HTTP */

const LYN_SUPPORTED_METHODS = {
  GET: true,
  DELETE: true,
  POST: true,
  PUT: true,
} as const;

export type LynSupportedMethods = keyof typeof LYN_SUPPORTED_METHODS;

/* Core */

export type LynConfig<
  TEnvConfig extends EnvConfig = {},
  TSchema extends DatabaseSchema | undefined = undefined
> = {
  /**
   * Environment variables to load and check at startup, in addition to
   * NODE_ENV. Parsed values are typed on `app.env`.
   * @example
   * new Lyn({ env: { port: { name: "PORT", type: "number" } } }).env.port // number
   */
  env?: TEnvConfig;
  /**
   * Cross-origin requests from browsers. Disabled when omitted: no CORS
   * header is sent and only same-origin pages can call the API.
   * @example
   * new Lyn({ cors: { origin: ["https://app.example.com"], credentials: true } })
   */
  cors?: CorsConfig;
  /**
   * Postgres through Drizzle. `ctx.db` and `app.db` are the Drizzle instance,
   * typed from `schema`. The connection is checked by `listen()` and closed
   * by `stop()`.
   * @example
   * import * as schema from "./db/schema";
   * new Lyn({ database: { schema } }) // reads DATABASE_URL
   */
  database?: DatabaseConfig<TSchema, LynEnv<TEnvConfig>>;
  start?: {
    /**
     * Remove the beautiful ascii art logo when the server starts
     */
    hideLynLogo?: boolean;
  };
  /**
   * How `listen()` exposes the process. Omitted, the server accepts
   * connections from this machine only.
   */
  server?: {
    /**
     * Interface to bind. `"0.0.0.0"` accepts connections from the network.
     * @default "127.0.0.1"
     */
    hostname?: string;
    /**
     * Hostnames accepted in the `Host` header while `listen()` is serving.
     * The bind address is included too, unless it is `0.0.0.0` or `::`.
     * Defaults to `127.0.0.1`, `localhost` and `::1`.
     */
    allowedHosts?: string[];
    /**
     * Maximum accepted JSON body, in bytes. A larger body is rejected
     * before it is parsed.
     * @default 1048576
     */
    maxBodyBytes?: number;
    /**
     * Maximum time a request may take, in milliseconds, including reading
     * the body and running the handler. The response is
     * `408 REQUEST_TIMEOUT` after that, and `ctx.signal` is aborted so the
     * handler can stop its work.
     * @default 30000
     */
    requestTimeoutMs?: number;
  };
};

export type SetDefinition = {
  headers: Headers;
  status: number;
};

export type AnySchema = ZodType<any, any, any>;
export type PotentialAnySchema = AnySchema | undefined;

export type BodyContext<TSchema extends PotentialAnySchema> =
  TSchema extends AnySchema
    ? {
        body: z.infer<TSchema>;
      }
    : {};

type ParamPrimitive = z.ZodString | z.ZodNumber;

type QueryPrimitive =
  | z.ZodString
  | z.ZodNumber
  | z.ZodBoolean
  | z.ZodOptional<z.ZodString>
  | z.ZodOptional<z.ZodNumber>
  | z.ZodOptional<z.ZodBoolean>;

export type ParamsSchema = z.ZodObject<Record<string, ParamPrimitive>> | undefined;
export type QuerySchema =
  | z.ZodObject<Record<string, QueryPrimitive>>
  | undefined;

export type QueryContext<TSchema extends QuerySchema> =
  TSchema extends NonNullable<QuerySchema>
    ? {
        query: z.infer<TSchema>;
      }
    : {};

export type ParamsContext<TSchema extends ParamsSchema> =
  TSchema extends NonNullable<ParamsSchema>
    ? {
        params: z.infer<TSchema>;
      }
    : {};

export type Context<
  TBodySchema extends PotentialAnySchema,
  TParamsSchema extends ParamsSchema,
  TQuerySchema extends QuerySchema,
  TAppContext = {}
> = BodyContext<TBodySchema> &
  QueryContext<TQuerySchema> &
  ParamsContext<TParamsSchema> &
  TAppContext & {
    request: Request;
    set: SetDefinition;
    /**
     * Aborted when the request times out or the client disconnects. Pass it
     * to `fetch` or check `signal.aborted` to stop work nobody will receive.
     */
    signal: AbortSignal;
  };

export type Validation<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends ParamsSchema = undefined,
  TQuerySchema extends QuerySchema = undefined
> = {
  body?: TBodySchema;
  params?: TParamsSchema;
  query?: TQuerySchema;
};
export type RouteHandlerBodyResponse = string | object | null | void;
export type RouteHandler<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends ParamsSchema = undefined,
  TQuerySchema extends QuerySchema = undefined,
  TAppContext = {}
> = (
  ctx: Context<TBodySchema, TParamsSchema, TQuerySchema, TAppContext>
) => RouteHandlerBodyResponse;

export type RoutePath = string;
export type Route<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends ParamsSchema = undefined,
  TQuerySchema extends QuerySchema = undefined,
  TAppContext = {}
> = {
  path: RoutePath;
  handler: RouteHandler<TBodySchema, TParamsSchema, TQuerySchema, TAppContext>;
  validation?: Validation<TBodySchema, TParamsSchema, TQuerySchema>;
  method: LynSupportedMethods;
};
