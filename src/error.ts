import type { ZodError } from "zod";

export class LynError extends Error {
  code: string;
  status: number;
  isLynError: boolean;

  constructor(code: string, status: number, message: string, cause?: string) {
    super(message);
    this.cause = cause;
    this.code = code;
    this.status = status;
    this.isLynError = true;
  }
}

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

export class NoQueryError extends LynError {
  constructor() {
    super("NO_QUERY", 400, "No query provided");
  }
}

export class InternalServerError extends LynError {
  constructor() {
    // Display no cause message for security reasons
    super("INTERNAL_SERVER_ERROR", 500, "Internal Server Error");
  }
}
