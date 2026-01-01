import { Lyn } from "#/index";
import { test, expect, spyOn, describe } from "bun:test";
import { TESTING_PORT } from "testing/constants";

describe("routes", () => {
  const spy = spyOn(Bun, "serve");
  test("routes are registered correctly", async () => {
    const app = new Lyn()
      .get("/", () => {
        return "Hello World";
      })
      .post("/", () => {
        return "Hello World";
      })
      .delete("/", () => {
        return "Hello World";
      })
      .put("/", () => {
        return "Hello World";
      })
      .listen(TESTING_PORT);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        routes: expect.objectContaining({
          "/": expect.objectContaining({
            GET: expect.any(Function),
            POST: expect.any(Function),
            DELETE: expect.any(Function),
            PUT: expect.any(Function),
          }),
        }),
      })
    );
    await app.stop();
  });
});
