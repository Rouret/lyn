import { Lyn } from "#/index";
import { describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { createTestClient } from "testing/utilsTest";
import z from "zod";

describe("handle", () => {
  it("answers without starting a server", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => "Hello World");

    const response = await app.handle(new Request("http://lyn/"));

    expect(await response.text()).toBe("Hello World");
    expect(() => app.url).toThrow("Server is not running");
  });

  it("dispatches each method of a path to its own handler", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/", () => "GET")
      .post("/", () => "POST")
      .put("/", () => "PUT")
      .delete("/", ({ set }) => {
        set.status = 200;
        return "DELETE";
      });
    const client = createTestClient(app);

    const bodies = await Promise.all(
      [client.get("/"), client.post("/"), client.put("/"), client.delete("/")].map(
        async (response) => (await response).text()
      )
    );

    expect(bodies).toEqual(["GET", "POST", "PUT", "DELETE"]);
  });

  it("passes route params to the handler", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get(
      "/users/:id",
      ({ params }) => ({ id: params.id }),
      { params: z.object({ id: z.string() }) }
    );

    const response = await createTestClient(app).get("/users/42");

    expect(await response.json()).toEqual({ id: "42" });
  });

  it("returns a JSON 404 for an unknown path", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/users", () => []);

    const response = await createTestClient(app).get("/posts");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      code: "NOT_FOUND",
      message: "Route GET /posts not found",
    });
  });

  it("returns a JSON 405 with an Allow header for a known path", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/users", () => [])
      .post("/users", () => ({}));

    const response = await createTestClient(app).delete("/users");

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, POST");
    expect(await response.json()).toEqual({
      code: "METHOD_NOT_ALLOWED",
      message: "Method DELETE not allowed on /users",
    });
  });

  it("answers OPTIONS on a known path with the allowed methods", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/users", () => [])
      .put("/users", () => ({}));

    const response = await app.handle(
      new Request("http://lyn/users", { method: "OPTIONS" })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, PUT, OPTIONS");
  });

  it("allows several apps in the same process", () => {
    expect(() => {
      new Lyn(TEST_LYN_CONFIG);
      new Lyn(TEST_LYN_CONFIG);
    }).not.toThrow();
  });

  it("rejects a duplicate route at registration", () => {
    expect(() =>
      new Lyn(TEST_LYN_CONFIG).get("/", () => "a").get("/", () => "b")
    ).toThrow("Route GET / is already registered");
  });
});

describe("listen", () => {
  it("serves the same routes over HTTP", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/users/:id", ({ params }) => ({ id: params.id }), {
        params: z.object({ id: z.string() }),
      })
      .listen();

    try {
      const found = await fetch(`${app.url}/users/7`);
      const missing = await fetch(`${app.url}/nope`);

      expect(await found.json()).toEqual({ id: "7" });
      expect(missing.status).toBe(404);
    } finally {
      await app.stop();
    }
  });
});
