import type { LynSupportedMethods } from "#/types";
import type { ZodError } from "zod";

export class LynError extends Error {
  code: string;
  status: number;
  isLynError: boolean;
  headers: Headers = new Headers();

  constructor(code: string, status: number, message: string, cause?: string) {
    super(message);
    this.cause = cause;
    this.code = code;
    this.status = status;
    this.isLynError = true;
  }
}

export const isLynError = (error: unknown): error is LynError =>
  typeof error === "object" &&
  error !== null &&
  "isLynError" in error &&
  error.isLynError === true;

export class ValidationError extends LynError {
  constructor(cause?: ZodError<any> | undefined) {
    super("VALIDATION", 400, "Bad Request", JSON.parse(cause?.message || "{}"));
  }
}

export class NoBodyError extends LynError {
  constructor() {
    super("NO_BODY", 400, "No body provided");
  }
}
export class NoParamsError extends LynError {
  constructor() {
    super("NO_PARAMS", 400, "No params provided");
  }
}

export class NotFoundError extends LynError {
  constructor(method: string, pathname: string) {
    super("NOT_FOUND", 404, `Route ${method} ${pathname} not found`);
  }
}

export class MethodNotAllowedError extends LynError {
  constructor(
    method: string,
    pathname: string,
    allowedMethods: LynSupportedMethods[]
  ) {
    super(
      "METHOD_NOT_ALLOWED",
      405,
      `Method ${method} not allowed on ${pathname}`
    );
    this.headers.set("Allow", allowedMethods.join(", "));
  }
}

export class InternalServerError extends LynError {
  constructor() {
    // Display no cause message for security reasons
    super("INTERNAL_SERVER_ERROR", 500, "Internal Server Error");
  }
}
