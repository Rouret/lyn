import { handleRequestLifecycle } from "#/request";
import type { Route } from "#/types";
import type { BunRequest } from "bun";
import { expect, test } from "bun:test";
import { requestFactory } from "testing/utilsTest";

test("set", async () => {
  const request = requestFactory.get("/");
  const fakeRoute: Route = {
    path: "/",
    handler: ({ set }) => {
      set.status = 201;
      set.headers.set("X-Custom-Header", "custom-value");
      return {
        message: "Hello World",
      };
    },
    validation: undefined,
    method: "GET",
  };

  const response = await handleRequestLifecycle(
    request as BunRequest,
    fakeRoute
  );
  expect(response.status).toBe(201);
  expect(response.headers.get("x-custom-header")).toBe("custom-value");
});
