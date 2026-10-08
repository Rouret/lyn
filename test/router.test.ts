import { createRouter } from "#/router";
import type { Route } from "#/types";
import { describe, expect, it } from "bun:test";
import z from "zod";

type AnyRoute = Route<any, any, any>;

const route = (method: Route["method"], path: string): AnyRoute => ({
  method,
  path,
  handler: () => path,
});

const routerWith = (...routes: AnyRoute[]) => {
  const router = createRouter();
  routes.forEach((r) => router.add(r));
  return router;
};

describe("router", () => {
  it("matches a static path", () => {
    const users = route("GET", "/users");
    const result = routerWith(users).match("GET", "/users");

    expect(result).toEqual({ status: "found", route: users, params: {} });
  });

  it("matches the root path", () => {
    const root = route("GET", "/");

    expect(routerWith(root).match("GET", "/")).toMatchObject({ route: root });
  });

  it("extracts and decodes params", () => {
    const result = routerWith(route("GET", "/users/:id/posts/:postId")).match(
      "GET",
      "/users/j%C3%A9r%C3%B4me/posts/42"
    );

    expect(result).toMatchObject({
      status: "found",
      params: { id: "jérôme", postId: "42" },
    });
  });

  it("keeps a param raw when it is not valid URI encoding", () => {
    const result = routerWith(route("GET", "/files/:name")).match(
      "GET",
      "/files/100%"
    );

    expect(result).toMatchObject({ params: { name: "100%" } });
  });

  it("prefers static segments over params", () => {
    const me = route("GET", "/users/me");
    const byId = route("GET", "/users/:id");
    const router = routerWith(byId, me);

    expect(router.match("GET", "/users/me")).toMatchObject({ route: me });
    expect(router.match("GET", "/users/42")).toMatchObject({ route: byId });
  });

  it("backtracks to a param branch when the static branch dead-ends", () => {
    const staticBranch = route("GET", "/users/me/settings");
    const paramBranch = route("GET", "/users/:id/posts");
    const router = routerWith(staticBranch, paramBranch);

    expect(router.match("GET", "/users/me/posts")).toMatchObject({
      route: paramBranch,
      params: { id: "me" },
    });
  });

  it("allows different param names at the same position", () => {
    const user = route("GET", "/users/:id");
    const posts = route("GET", "/users/:userId/posts");
    const router = routerWith(user, posts);

    expect(router.match("GET", "/users/1")).toMatchObject({
      params: { id: "1" },
    });
    expect(router.match("GET", "/users/1/posts")).toMatchObject({
      params: { userId: "1" },
    });
  });

  it("matches a wildcard against the rest of the path", () => {
    const files = route("GET", "/files/*");
    const router = routerWith(files);

    expect(router.match("GET", "/files/a/b/c.txt")).toMatchObject({
      route: files,
    });
    expect(router.match("GET", "/files")).toMatchObject({ route: files });
  });

  it("prefers params over wildcards", () => {
    const byName = route("GET", "/files/:name");
    const rest = route("GET", "/files/*");
    const router = routerWith(rest, byName);

    expect(router.match("GET", "/files/a")).toMatchObject({ route: byName });
    expect(router.match("GET", "/files/a/b")).toMatchObject({ route: rest });
  });

  it("ignores trailing and duplicate slashes", () => {
    const users = route("GET", "/users");

    expect(routerWith(users).match("GET", "/users/")).toMatchObject({
      route: users,
    });
    expect(routerWith(users).match("GET", "//users")).toMatchObject({
      route: users,
    });
  });

  it("returns not_found for an unknown path", () => {
    expect(routerWith(route("GET", "/users")).match("GET", "/posts")).toEqual({
      status: "not_found",
    });
  });

  it("returns method_not_allowed with the allowed methods", () => {
    const router = routerWith(route("GET", "/users"), route("POST", "/users"));

    expect(router.match("DELETE", "/users")).toEqual({
      status: "method_not_allowed",
      allowedMethods: ["GET", "POST"],
    });
  });

  it("rejects a duplicate route", () => {
    expect(() =>
      routerWith(route("GET", "/users/:id"), route("GET", "/users/:userId"))
    ).toThrow("Route GET /users/:userId is already registered");
  });

  it("rejects a path that does not start with a slash", () => {
    expect(() => routerWith(route("GET", "users"))).toThrow(
      'Route path must start with "/": users'
    );
  });

  it("rejects an empty path", () => {
    expect(() => routerWith(route("GET", ""))).toThrow(
      "Route path cannot be empty"
    );
  });

  it("rejects a wildcard that is not the last segment", () => {
    expect(() => routerWith(route("GET", "/files/*/meta"))).toThrow(
      "Wildcard must be the last segment: /files/*/meta"
    );
  });

  it("accepts a params schema whose keys are all params of the path", () => {
    expect(() =>
      routerWith({
        ...route("GET", "/users/:id/posts/:slug"),
        validation: { params: z.object({ id: z.number(), slug: z.string() }) },
      })
    ).not.toThrow();
  });

  it("rejects a params schema on a path without params", () => {
    expect(() =>
      routerWith({
        ...route("GET", "/users"),
        validation: { params: z.object({ id: z.string() }) },
      })
    ).toThrow(
      'Params schema of GET /users declares "id", which is not a param of the path'
    );
  });

  it("rejects params schema keys that do not match the path params", () => {
    expect(() =>
      routerWith({
        ...route("GET", "/users/:id"),
        validation: {
          params: z.object({ userId: z.string(), slug: z.string() }),
        },
      })
    ).toThrow(
      'Params schema of GET /users/:id declares "userId", "slug", which are not params of the path'
    );
  });
});
