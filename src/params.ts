import { coerceValue } from "#lyn/coerce";
import type { ParamsSchema } from "#lyn/types";

export const parseParams = (
  params: Record<string, string>,
  schema: NonNullable<ParamsSchema>
) => {
  const coercedParams = Object.fromEntries(
    Object.entries(params).map(([key, rawValue]) => {
      const field = schema.shape[key];
      return [key, field ? coerceValue(field, rawValue) : rawValue];
    })
  );
  return schema.safeParse(coercedParams);
};
