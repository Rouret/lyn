import { Lyn } from "#/index";
import { test, expect, spyOn } from "bun:test";

const spy = spyOn(Bun, "serve");

test("routes are registered correctly", () => {
  new Lyn()
    .get("/", () => {
      return new Response("Hello World");
    })
    .post("/", () => {
      return new Response("Hello World");
    })
    .delete("/", () => {
      return new Response("Hello World");
    })
    .put("/", () => {
      return new Response("Hello World");
    })
    .listen(3000);

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
});
