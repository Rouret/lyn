import z from "zod";
import { Lyn } from "../src";

new Lyn()
  .get("/", () => {
    return "Hello World";
  })
  .post("/", ({ set }) => {
    set.status = 201;
    return {
      message: "Hello World",
    };
  })
  .post(
    "/users",
    ({ body, set }) => {
      set.status = 201;
      return {
        message: "Hello " + body.name,
      };
    },
    {
      body: z.object({
        name: z.string(),
      }),
    }
  )
  .listen(3000);
