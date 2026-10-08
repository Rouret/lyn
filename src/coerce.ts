import { ZodBoolean, ZodNumber, ZodOptional, type ZodType } from "zod";

const BOOLEAN_VALUES: Record<string, boolean> = {
  true: true,
  "1": true,
  false: false,
  "0": false,
};

const unwrapOptional = (field: ZodType): ZodType =>
  field instanceof ZodOptional ? (field.unwrap() as ZodType) : field;

export const coerceValue = (field: ZodType, rawValue: string): unknown => {
  const fieldType = unwrapOptional(field);

  if (fieldType instanceof ZodNumber) {
    return rawValue.trim() === "" ? rawValue : Number(rawValue);
  }
  if (fieldType instanceof ZodBoolean) {
    return BOOLEAN_VALUES[rawValue] ?? rawValue;
  }
  return rawValue;
};
