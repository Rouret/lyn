export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const isServerError = (status: number) =>
  status >= HTTP_STATUS.INTERNAL_SERVER_ERROR;

export const isClientError = (status: number) =>
  status >= HTTP_STATUS.BAD_REQUEST && !isServerError(status);
