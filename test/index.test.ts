import { Lyn } from "#/index";
import { describe, expect, it } from "bun:test";
import { TESTING_PORT, TESTING_URL } from "testing/constants";
import z from "zod";

describe("Post's body validation", () => {
  it("send request and response to the client", async () => {
    const app = new Lyn()
      .post(
        "/users",
        ({ body }) => {
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
      .listen(TESTING_PORT);

    const response = await fetch(`${TESTING_URL}/users`, {
      method: "POST",
      body: JSON.stringify({ name: "John" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      message: "Hello John",
    });

    await app.stop();
  });

  it("send bad request", async () => {
    const app = new Lyn()
      .post(
        "/users",
        ({ body }) => {
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
      .listen(TESTING_PORT);

    const response = await fetch(`${TESTING_URL}/users`, {
      method: "POST",
      body: JSON.stringify({ badKey: "John" }),
    });

    expect(response.status).toBe(400);
    await app.stop();
  });
});
