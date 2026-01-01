import z, { ZodType } from "zod";

export type AnySchema = ZodType<any, any, any>;
export type PotentialAnySchema = AnySchema | undefined;

export type Context<TBodySchema extends PotentialAnySchema> =
  TBodySchema extends AnySchema
    ? {
        request: Request;
        body: z.infer<TBodySchema>;
      }
    : {
        request: Request;
      };

export type Validation<TBodySchema extends PotentialAnySchema = undefined> = {
  body?: TBodySchema;
};

export type RouteHandler<TBodySchema extends PotentialAnySchema = undefined> = (
  ctx: Context<TBodySchema>
) => Response;
export type RoutePath = string;
export type Route<TBodySchema extends PotentialAnySchema = undefined> = {
  path: RoutePath;
  handler: RouteHandler<TBodySchema>;
  validation?: Validation<TBodySchema>;
};
