import z from "zod";
import { Lyn } from "../src";

new Lyn()
  .get("/", () => {
    return new Response("Hello World");
  })
  .post("/", () => {
    return new Response("Hello World");
  })
  .post(
    "/users",
    ({ body }) => {
      return new Response("Hello " + body.name);
    },
    {
      body: z.object({
        name: z.string(),
      }),
    }
  )
  .listen(3000);
