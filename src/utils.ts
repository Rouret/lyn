import { HTTP_STATUS } from "#/http-status";
import type { LynSupportedMethods } from "#/types";

export const getDefaultStatusFromMethod = (
  method: LynSupportedMethods
): number => {
  switch (method) {
    case "GET":
      return HTTP_STATUS.OK;
    case "POST":
      return HTTP_STATUS.CREATED;
    case "PUT":
      return HTTP_STATUS.OK;
    case "DELETE":
      return HTTP_STATUS.NO_CONTENT;
  }
};
