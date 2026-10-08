import { coerceValue } from "#/coerce";
import type { QuerySchema } from "#/types";
import type { ZodType } from "zod";

const readField = (
  searchParams: URLSearchParams,
  key: string,
  field: ZodType
): unknown => {
  const rawValues = searchParams.getAll(key);
  if (rawValues.length === 0) return undefined;
  if (rawValues.length > 1) return rawValues;
  return coerceValue(field, rawValues[0]!);
};

export const parseQuery = (
  searchParams: URLSearchParams,
  schema: NonNullable<QuerySchema>
) => {
  const rawQuery = Object.fromEntries(
    Object.entries(schema.shape)
      .map(([key, field]) => [key, readField(searchParams, key, field)])
      .filter(([, value]) => value !== undefined)
  );
  return schema.safeParse(rawQuery);
};
