import { Lyn } from "#/index";
import { expect, test } from "bun:test";
import { TESTING_PORT, TESTING_URL } from "testing/constants";

test("set", async () => {
  const app = new Lyn()
    .post("/users", ({ set }) => {
      set.status = 201;
      set.headers.set("X-Custom-Header", "custom-value");

      return {
        message: "Hello World",
      };
    })
    .listen(TESTING_PORT);

  const response = await fetch(`${TESTING_URL}/users`, {
    method: "POST",
  });

  expect(response.status).toBe(201);
  expect(response.headers.get("X-Custom-Header")).toBe("custom-value");
  expect(response.headers.get("Content-Type")).toBe("application/json");
  await app.stop();
});
