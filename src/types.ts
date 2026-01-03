import type { BunRequest } from "bun";
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
type ParamLeaf = ParamPrimitive | z.ZodArray<ParamPrimitive>;

type QueryPrimitive =
  | z.ZodString
  | z.ZodNumber
  | z.ZodBoolean
  | z.ZodOptional<z.ZodString>
  | z.ZodOptional<z.ZodNumber>
  | z.ZodOptional<z.ZodBoolean>;

export type ParamsSchema = z.ZodObject<Record<string, ParamLeaf>> | undefined;
export type QuerySchema =
  | z.ZodObject<Record<string, QueryPrimitive>>
  | undefined;

export type QueryInfer = z.infer<QueryPrimitive>;

export type QueryContext<TSchema extends QuerySchema> =
  TSchema extends QuerySchema
    ? {
        query: z.infer<TSchema>;
      }
    : {};

export type ParamsContext<TSchema extends ParamsSchema> =
  TSchema extends ParamsSchema
    ? {
        params: z.infer<TSchema>;
      }
    : {};

export type Context<
  TBodySchema extends PotentialAnySchema,
  TParamsSchema extends ParamsSchema,
  TQuerySchema extends QuerySchema
> = BodyContext<TBodySchema> &
  QueryContext<TQuerySchema> &
  ParamsContext<TParamsSchema> & {
    request: BunRequest;
    set: SetDefinition;
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
export type RouteHandlerBodyResponse = string | object | null;
export type RouteHandler<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends ParamsSchema = undefined,
  TQuerySchema extends QuerySchema = undefined
> = (
  ctx: Context<TBodySchema, TParamsSchema, TQuerySchema>
) => RouteHandlerBodyResponse;

export type RoutePath = string;
export type Route<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends ParamsSchema = undefined,
  TQuerySchema extends QuerySchema = undefined
> = {
  path: RoutePath;
  handler: RouteHandler<TBodySchema, TParamsSchema, TQuerySchema>;
  validation?: Validation<TBodySchema, TParamsSchema, TQuerySchema>;
  method: LynSupportedMethods;
};

/* Bun Routes */
type BunMethodHandler = (request: BunRequest) => Promise<Response>;

export type BunRoutes = Record<
  string,
  Partial<Record<LynSupportedMethods, BunMethodHandler>>
>;
