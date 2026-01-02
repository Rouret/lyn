import z from "zod";
import { Lyn } from "../src";

new Lyn()
  .get("/text", () => {
    return "Hello World";
  })
  .get("/json", () => {
    return {
      message: "Hello World",
    };
  })
  .get(
    "/:name",
    ({ params }) => {
      return {
        message: "Hello " + params.name,
      };
    },
    {
      params: z.object({
        name: z.string(),
      }),
    }
  )
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
