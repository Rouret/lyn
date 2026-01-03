import { Lyn } from "#/index";
import { test, expect, spyOn, describe } from "bun:test";

describe("routes", () => {
  test("routes are registered correctly", async () => {
    const spy = spyOn(Bun, "serve");
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
      .listen();
    await app.stop();
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

    spy.mockRestore();
  });
});
