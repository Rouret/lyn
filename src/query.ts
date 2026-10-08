import type { QuerySchema } from "#/types";
import { ZodBoolean, ZodNumber, ZodOptional, type ZodType } from "zod";

const BOOLEAN_VALUES: Record<string, boolean> = {
  true: true,
  "1": true,
  false: false,
  "0": false,
};

const unwrapOptional = (field: ZodType): ZodType =>
  field instanceof ZodOptional ? (field.unwrap() as ZodType) : field;

const coerceValue = (field: ZodType, rawValue: string): unknown => {
  const fieldType = unwrapOptional(field);

  if (fieldType instanceof ZodNumber) {
    return rawValue.trim() === "" ? rawValue : Number(rawValue);
  }
  if (fieldType instanceof ZodBoolean) {
    return BOOLEAN_VALUES[rawValue] ?? rawValue;
  }
  return rawValue;
};

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
