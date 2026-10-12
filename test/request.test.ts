import { Lyn } from "#lyn/index";
import { pathnameOf } from "#lyn/request";
import { describe, expect, it, spyOn } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";
import { createTestClient } from "testing/utilsTest";

import z from "zod";

describe("Content type", () => {
  it("should return application/json for JSON response", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/json", () => {
        return { message: "Hello World" };
      })
      .get("/text", () => {
        return "Hello World";
      });

    const client = createTestClient(app);

    const response = await client.get("/json");
    expect(response.headers.get("content-type")).toBe("application/json");

    const response2 = await client.get("/text");
    expect(response2.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8"
    );
  });
});

describe("Text encoding", () => {
  it("declares UTF-8 so non-ASCII text decodes correctly", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => "héllo ✓ 日本");

    const response = await createTestClient(app).get("/");
    const declaredCharset = response.headers
      .get("content-type")
      ?.split("charset=")[1];
    const decoder = new TextDecoder(
      (declaredCharset ?? "iso-8859-1") as ConstructorParameters<
        typeof TextDecoder
      >[0]
    );

    expect(decoder.decode(await response.arrayBuffer())).toBe("héllo ✓ 日本");
  });
});

describe("Handle Error", () => {
  it("should return application/json for JSON response", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
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
      .get("/error", () => {
        throw new Error("Test error");
      });
    const client = createTestClient(app);
    const response = await client.post("/users");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { code: string }).code).toBe("NO_BODY");

    const response2 = await client.get("/error");
    expect(response2.status).toBe(500);
    expect(((await response2.json()) as { code: string }).code).toBe(
      "INTERNAL_SERVER_ERROR"
    );
  });
});

describe("Unserializable response", () => {
  it.each([
    ["a synchronous", () => ({ count: 1n })],
    ["an async", async () => ({ count: 1n })],
  ])("returns 500 when %s handler returns a body JSON cannot encode", async (_, handler) => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", handler);

    const response = await app.handle(new Request("http://lyn.test/"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
    });
  });
});

describe("pathnameOf", () => {
  it.each([
    ["http://lyn.test/users", "/users"],
    ["http://lyn.test/", "/"],
    ["http://lyn.test", "/"],
    ["http://lyn.test:3000/users?page=2", "/users"],
    ["http://lyn.test/users?", "/users"],
    ["http://lyn.test/users#top", "/users"],
    ["http://lyn.test/users?next=/a#b?c", "/users"],
    ["http://lyn.test/users#a?b", "/users"],
    ["http://user:pass@lyn.test/users", "/users"],
    ["http://[::1]:3000/users", "/users"],
    ["http://lyn.test//double//slash", "//double//slash"],
    ["http://lyn.test/caf%C3%A9/%2F", "/caf%C3%A9/%2F"],
  ])("reads the path of %s", (url, pathname) => {
    expect(pathnameOf(url)).toBe(pathname);
    expect(pathnameOf(url)).toBe(new URL(url).pathname);
  });

  it.each(["http://lyn.test/a/../b", "http://lyn.test/a/./b", "http://lyn.test/a\\b"])(
    "matches URL on the normalized url of a Request (%s)",
    (url) => {
      const { url: normalized } = new Request(url);

      expect(pathnameOf(normalized)).toBe(new URL(normalized).pathname);
    }
  );
});

describe("Non-Error throws", () => {
  const thrownValues: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "secret detail"],
    ["a number", 42],
    ["an object with a truthy non-boolean isLynError", { isLynError: "yes" }],
    ["a Lyn error without a status", { isLynError: true, code: "X", message: "secret detail" }],
    ["a Lyn error with a success status", { isLynError: true, code: "X", status: 200 }],
    ["a Lyn error with a non-integer status", { isLynError: true, code: "X", status: 404.5 }],
    ["a Lyn error with an out-of-range status", { isLynError: true, code: "X", status: 600 }],
    ["a Lyn error without a code", { isLynError: true, status: 404 }],
  ];

  it.each(thrownValues)(
    "returns a generic 500 when the handler throws %s",
    async (_, thrownValue) => {
      const app = new Lyn(TEST_LYN_CONFIG).get("/", () => {
        throw thrownValue;
      });

      const response = await createTestClient(app).get("/");

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
      });
    }
  );

  it("still honours a duck-typed Lyn error", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => {
      throw Object.assign(new Error("User not found"), {
        isLynError: true,
        code: "NOT_FOUND",
        status: 404,
      });
    });

    const response = await createTestClient(app).get("/");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      code: "NOT_FOUND",
      message: "User not found",
    });
  });
});

describe("Handler without a return value", () => {
  it("answers with an empty body and the default status", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => {});

    const response = await createTestClient(app).get("/");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("keeps the status set by the handler", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).post("/jobs", async ({ set }) => {
      set.status = 202;
      set.headers.set("Location", "/jobs/1");
    });

    const response = await createTestClient(app).post("/jobs");

    expect(response.status).toBe(202);
    expect(response.headers.get("location")).toBe("/jobs/1");
    expect(await response.text()).toBe("");
  });

  it("still serialises null as JSON", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => null);

    const response = await createTestClient(app).get("/");

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.text()).toBe("null");
  });
});

describe("Content type set by the handler", () => {
  it("keeps a content type set for a string body", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
      set.headers.set("Content-Type", "text/html; charset=utf-8");
      return "<h1>Hello</h1>";
    });

    const response = await createTestClient(app).get("/");

    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8"
    );
    expect(await response.text()).toBe("<h1>Hello</h1>");
  });

  it("keeps a content type set for a JSON body", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", ({ set }) => {
      set.status = 409;
      set.headers.set("Content-Type", "application/problem+json");
      return { title: "Conflict" };
    });

    const response = await createTestClient(app).get("/");

    expect(response.headers.get("content-type")).toBe(
      "application/problem+json"
    );
    expect(await response.json()).toEqual({ title: "Conflict" });
  });
});

describe("request timeout", () => {
  it("returns 408 REQUEST_TIMEOUT when the handler outlives the limit", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      server: { requestTimeoutMs: 20 },
    }).get("/", () => Bun.sleep(200).then(() => "ok"));

    const response = await app.handle(new Request("http://lyn.test/"));

    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({
      code: "REQUEST_TIMEOUT",
      message: "Request timed out",
    });
  });

  it("aborts ctx.signal when the request times out", async () => {
    let signal: AbortSignal | undefined;
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      server: { requestTimeoutMs: 20 },
    }).get("/", (context) => {
      signal = context.signal;
      return Bun.sleep(200).then(() => "ok");
    });

    await app.handle(new Request("http://lyn.test/"));

    expect(signal?.aborted).toBe(true);
  });

  it("aborts ctx.signal when the client goes away", async () => {
    const client = new AbortController();
    let signal: AbortSignal | undefined;
    const app = new Lyn(TEST_LYN_CONFIG).get("/", async (context) => {
      signal = context.signal;
      client.abort();
      return "ok";
    });

    await app.handle(new Request("http://lyn.test/", { signal: client.signal }));

    expect(signal?.aborted).toBe(true);
  });

  it("leaves ctx.signal alone when the handler finishes in time", async () => {
    let signal: AbortSignal | undefined;
    const app = new Lyn(TEST_LYN_CONFIG).get("/", (context) => {
      signal = context.signal;
      return "ok";
    });

    await app.handle(new Request("http://lyn.test/"));

    expect(signal?.aborted).toBe(false);
  });

  it("aborts ctx.signal read after the request timed out", async () => {
    let abortedWhenRead: boolean | undefined;
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      server: { requestTimeoutMs: 20 },
    }).get("/", async (context) => {
      await Bun.sleep(60);
      abortedWhenRead = context.signal.aborted;
      return "ok";
    });

    const response = await app.handle(new Request("http://lyn.test/"));
    await Bun.sleep(80);

    expect(response.status).toBe(408);
    expect(abortedWhenRead).toBe(true);
  });

  it("aborts ctx.signal of a synchronous handler when the client is gone", async () => {
    const client = new AbortController();
    client.abort();
    let aborted: boolean | undefined;
    const app = new Lyn(TEST_LYN_CONFIG).get("/", (context) => {
      aborted = context.signal.aborted;
      return "ok";
    });

    await app.handle(new Request("http://lyn.test/", { signal: client.signal }));

    expect(aborted).toBe(true);
  });

  it("returns 408 when the body is not received in time", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      server: { requestTimeoutMs: 20 },
    }).post("/", ({ body }) => body, { body: z.object({ name: z.string() }) });

    const response = await app.handle(
      new Request("http://lyn.test/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: new ReadableStream({ start() {} }),
      })
    );

    expect(response.status).toBe(408);
  });

  it("arms the timeout only for a handler that returns a promise", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      server: { requestTimeoutMs: 1234 },
    })
      .get("/sync", () => "ok")
      .get("/async", async () => "ok");
    const setTimeoutSpy = spyOn(globalThis, "setTimeout");

    try {
      const sync = await app.handle(new Request("http://lyn.test/sync"));
      const timersForSync = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === 1234);
      const asynchronous = await app.handle(new Request("http://lyn.test/async"));
      const timersForAsync = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === 1234);

      expect(await sync.text()).toBe("ok");
      expect(await asynchronous.text()).toBe("ok");
      expect(timersForSync).toHaveLength(0);
      expect(timersForAsync).toHaveLength(1);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("creates ctx.signal only when the handler reads it", async () => {
    const app = new Lyn(TEST_LYN_CONFIG)
      .get("/ignores", () => "ok")
      .get("/reads", ({ signal }) => String(signal.aborted));
    const anySpy = spyOn(AbortSignal, "any");

    try {
      await app.handle(new Request("http://lyn.test/ignores"));
      const callsWhenIgnored = anySpy.mock.calls.length;
      const reads = await app.handle(new Request("http://lyn.test/reads"));

      expect(callsWhenIgnored).toBe(0);
      expect(await reads.text()).toBe("false");
      expect(anySpy).toHaveBeenCalledTimes(1);
    } finally {
      anySpy.mockRestore();
    }
  });

  it("rejects a non-positive timeout", () => {
    expect(
      () => new Lyn({ ...TEST_LYN_CONFIG, server: { requestTimeoutMs: 0 } })
    ).toThrow("server.requestTimeoutMs must be a positive integer");
  });
});
