import { Lyn } from "#/index";
import { expect, test } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { createTestClient } from "testing/utilsTest";

test("set", async () => {
  const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
    set.status = 201;
    set.headers.set("X-Custom-Header", "custom-value");
    return {
      message: "Hello World",
    };
  });

  const response = await createTestClient(app).get("/");

  expect(response.status).toBe(201);
  expect(response.headers.get("x-custom-header")).toBe("custom-value");
});
