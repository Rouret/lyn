// TODO(lyn): Lyn doesn't export LynError, so business errors are duck-typed.
export const httpError = (status: number, code: string, message: string) =>
  Object.assign(new Error(message), { isLynError: true, status, code });

const postgresErrorCode = (error: unknown): string | undefined => {
  const cause = error instanceof Error ? error.cause : undefined;
  return (cause as { errno?: string } | undefined)?.errno;
};

// TODO(lyn): Lyn should map unique and foreign key violations itself.
export const isUniqueViolation = (error: unknown) =>
  postgresErrorCode(error) === "23505";

export const isForeignKeyViolation = (error: unknown) =>
  postgresErrorCode(error) === "23503";
