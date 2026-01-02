import type { BunRequest } from "bun";
import z, { ZodType } from "zod";

/* HTTP */

export const LYN_SUPPORTED_METHODS = {
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

type ParamPrimitive = z.ZodString | z.ZodNumber | z.ZodBoolean;
type ParamLeaf = ParamPrimitive | z.ZodArray<ParamPrimitive>;
export type ParamsSchema = z.ZodObject<Record<string, ParamLeaf>> | undefined;

export type ParamsContext<TSchema extends ParamsSchema> =
  TSchema extends ParamsSchema
    ? {
        params: z.infer<TSchema>;
      }
    : {};

export type Context<
  TBodySchema extends PotentialAnySchema,
  TParamsSchema extends ParamsSchema
> = BodyContext<TBodySchema> &
  ParamsContext<TParamsSchema> & {
    request: BunRequest;
    set: SetDefinition;
  };

export type Validation<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends PotentialAnySchema = undefined
> = {
  body?: TBodySchema;
  params?: TParamsSchema;
};
export type RouteHandlerBodyResponse = string | object | null;
export type RouteHandler<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends ParamsSchema = undefined
> = (ctx: Context<TBodySchema, TParamsSchema>) => RouteHandlerBodyResponse;

export type RoutePath = string;
export type Route<
  TBodySchema extends PotentialAnySchema = undefined,
  TParamsSchema extends ParamsSchema = undefined
> = {
  path: RoutePath;
  handler: RouteHandler<TBodySchema, TParamsSchema>;
  validation?: Validation<TBodySchema, TParamsSchema>;
  method: LynSupportedMethods;
};

/* Bun Routes */
type BunMethodHandler = (request: BunRequest) => Promise<Response>;

export type BunRoutes = Record<
  string,
  Partial<Record<LynSupportedMethods, BunMethodHandler>>
>;
