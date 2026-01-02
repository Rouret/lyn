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

export type Context<TBodySchema extends PotentialAnySchema> =
  TBodySchema extends AnySchema
    ? {
        request: Request;
        set: SetDefinition;
        body: z.infer<TBodySchema>;
      }
    : {
        set: SetDefinition;
        request: Request;
      };

export type Validation<TBodySchema extends PotentialAnySchema = undefined> = {
  body?: TBodySchema;
};
export type RouteHandlerBodyResponse = string | object | null;
export type RouteHandler<TBodySchema extends PotentialAnySchema = undefined> = (
  ctx: Context<TBodySchema>
) => RouteHandlerBodyResponse;

export type RoutePath = string;
export type Route<TBodySchema extends PotentialAnySchema = undefined> = {
  path: RoutePath;
  handler: RouteHandler<TBodySchema>;
  validation?: Validation<TBodySchema>;
  method: LynSupportedMethods;
};

/* Bun Routes */
type BunMethodHandler = (request: Request) => Promise<Response>;

export type BunRoutes = Record<
  string,
  Partial<Record<LynSupportedMethods, BunMethodHandler>>
>;
