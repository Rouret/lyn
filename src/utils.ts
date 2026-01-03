import type { LynSupportedMethods } from "#/types";
import z from "zod";

export const getDefaultStatusFromMethod = (
  method: LynSupportedMethods
): number => {
  switch (method) {
    case "GET":
      return 200;
    case "POST":
      return 201;
    case "PUT":
      return 200;
    case "DELETE":
      return 204;
  }
};
