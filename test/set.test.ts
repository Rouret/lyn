import { Lyn } from "#/index";
import { expect, test } from "bun:test";
import { TESTING_PORT, TESTING_URL } from "testing/constants";

test("set", async () => {
  const app = new Lyn()
    .post("/users", ({ set }) => {
      // 203 for testing, because getDefaultStatusFromMethod return 201 for POST
      set.status = 203;
      set.headers.set("X-Custom-Header", "custom-value");

      return {
        message: "Hello World",
      };
    })
    .listen(TESTING_PORT);

  const response = await fetch(`${TESTING_URL}/users`, {
    method: "POST",
  });

  expect(response.status).toBe(203);
  expect(response.headers.get("x-custom-header")).toBe("custom-value");
  await app.stop();
});
