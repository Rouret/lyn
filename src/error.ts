import { HTTP_STATUS } from "#lyn/http-status";
import type { LynSupportedMethods } from "#lyn/types";
import type { ZodError } from "zod";

export class LynError extends Error {
  code: string;
  status: number;
  isLynError: boolean;
  headers: Headers = new Headers();

  constructor(code: string, status: number, message: string, cause?: unknown) {
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

const issuesForClient = (error?: ZodError): unknown => {
  let issues: unknown;
  try {
    issues = JSON.parse(error?.message || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(issues)) return [];
  return issues.map((issue) => {
    if (typeof issue !== "object" || issue === null || !("pattern" in issue)) return issue;
    const { pattern: _pattern, ...rest } = issue;
    return rest;
  });
};

export class ValidationError extends LynError {
  constructor(cause?: ZodError<any> | undefined) {
    super("VALIDATION", HTTP_STATUS.BAD_REQUEST, "Bad Request", issuesForClient(cause));
  }
}

export class InvalidValueError extends LynError {
  constructor(message: string) {
    super("VALIDATION", HTTP_STATUS.BAD_REQUEST, message);
  }
}

export class ConflictError extends LynError {
  constructor(message: string) {
    super("CONFLICT", HTTP_STATUS.CONFLICT, message);
  }
}

export class NoBodyError extends LynError {
  constructor() {
    super("NO_BODY", HTTP_STATUS.BAD_REQUEST, "No body provided");
  }
}
export class UnsupportedMediaTypeError extends LynError {
  constructor(contentType: string) {
    super(
      "UNSUPPORTED_MEDIA_TYPE",
      HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE,
      `Unsupported content type: ${contentType || "none"}, expected application/json`
    );
  }
}

export class RequestTimeoutError extends LynError {
  constructor() {
    super("REQUEST_TIMEOUT", HTTP_STATUS.REQUEST_TIMEOUT, "Request timed out");
  }
}

export class PayloadTooLargeError extends LynError {
  constructor() {
    super(
      "PAYLOAD_TOO_LARGE",
      HTTP_STATUS.PAYLOAD_TOO_LARGE,
      "Request body is too large"
    );
  }
}

export class InvalidJsonError extends LynError {
  constructor() {
    super("INVALID_JSON", HTTP_STATUS.BAD_REQUEST, "Request body is not valid JSON");
  }
}

export class InvalidHostError extends LynError {
  constructor() {
    super("INVALID_HOST", HTTP_STATUS.BAD_REQUEST, "This host is not allowed");
  }
}

export class NotFoundError extends LynError {
  constructor(method: string, pathname: string) {
    super("NOT_FOUND", HTTP_STATUS.NOT_FOUND, `Route ${method} ${pathname} not found`);
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
      HTTP_STATUS.METHOD_NOT_ALLOWED,
      `Method ${method} not allowed on ${pathname}`
    );
    this.headers.set("Allow", allowedMethods.join(", "));
  }
}

export class InternalServerError extends LynError {
  constructor() {
    // Display no cause message for security reasons
    super("INTERNAL_SERVER_ERROR", HTTP_STATUS.INTERNAL_SERVER_ERROR, "Internal Server Error");
  }
}
