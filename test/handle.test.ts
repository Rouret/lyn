import { Lyn } from "#lyn/index";
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

const listenAddresses = async (url: string): Promise<string[]> => {
  const port = Number(new URL(url).port);
  if (process.platform === "linux") {
    const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
    const tables = await Promise.all(
      ["/proc/net/tcp", "/proc/net/tcp6"].map((path) => Bun.file(path).text().catch(() => ""))
    );
    return tables
      .flatMap((table) => table.split("\n"))
      .map((line) => line.trim().split(/\s+/))
      .filter((parts) => parts[3] === "0A" && parts[1]?.toUpperCase().endsWith(`:${hexPort}`))
      .map((parts) => {
        const hex = parts[1]!.split(":")[0]!;
        if (hex === "0100007F") return "127.0.0.1";
        if (hex === "00000000") return "0.0.0.0";
        if (hex === "00000000000000000000000000000001") return "::1";
        if (hex === "00000000000000000000000000000000") return "::";
        return hex;
      });
  }

  const probe = Bun.spawn(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(probe.stdout).text();
  await probe.exited;
  return [...output.matchAll(/(\S+):\d+ \(LISTEN\)/g)].map((match) => match[1] ?? "");
};

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "[::1]"]);

describe("listen", () => {
  it("serves the same routes over HTTP", async () => {
    const app = await new Lyn(TEST_LYN_CONFIG)
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

  it("binds the loopback interface unless a hostname is set", async () => {
    const local = await new Lyn(TEST_LYN_CONFIG).get("/", () => "ok").listen();
    const exposed = await new Lyn({
      ...TEST_LYN_CONFIG,
      server: { hostname: "0.0.0.0" },
    })
      .get("/", () => "ok")
      .listen();

    try {
      expect(local.url.startsWith("http://127.0.0.1:")).toBe(true);
      expect(exposed.url.startsWith("http://127.0.0.1:")).toBe(true);
      const localAddresses = await listenAddresses(local.url);
      const exposedAddresses = await listenAddresses(exposed.url);
      expect(localAddresses.length).toBeGreaterThan(0);
      expect(localAddresses.every((address) => LOOPBACK_ADDRESSES.has(address))).toBe(true);
      expect(exposedAddresses.some((address) => address === "0.0.0.0" || address === "::" || address === "*")).toBe(
        true
      );
    } finally {
      await Promise.all([local.stop(), exposed.stop()]);
    }
  });

  it("rejects a Host header that is not allowed while serving", async () => {
    const app = await new Lyn({
      ...TEST_LYN_CONFIG,
      server: { allowedHosts: ["app.test"] },
    })
      .get("/", () => "ok")
      .listen();
    const port = new URL(app.url).port;

    try {
      const allowed = await fetch(app.url, { headers: { host: `app.test:${port}` } });
      const refused = await fetch(app.url, { headers: { host: `evil.example:${port}` } });

      expect(await allowed.text()).toBe("ok");
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({
        code: "INVALID_HOST",
        message: "This host is not allowed",
      });
    } finally {
      await app.stop();
    }
  });

  it("rejects an empty allowed host list", () => {
    expect(
      () => new Lyn({ ...TEST_LYN_CONFIG, server: { allowedHosts: [] } })
    ).toThrow("server.allowedHosts must list at least one host");
  });

  it("refuses to listen while already running", async () => {
    const app = await new Lyn(TEST_LYN_CONFIG).get("/", () => "ok").listen();

    try {
      await expect(app.listen()).rejects.toThrow(
        `Server is already running on ${app.url}. Call stop() before listening again.`
      );
    } finally {
      await app.stop();
    }
  });

  it("can listen again after stop", async () => {
    const app = new Lyn(TEST_LYN_CONFIG).get("/", () => "ok");

    await app.listen();
    await app.stop();
    await app.listen();

    try {
      expect(await (await fetch(app.url)).text()).toBe("ok");
    } finally {
      await app.stop();
    }
  });

  it("does not accumulate signal listeners across restarts or apps", async () => {
    const first = new Lyn(TEST_LYN_CONFIG).get("/", () => "ok");
    const second = new Lyn(TEST_LYN_CONFIG).get("/", () => "ok");
    const countListeners = () => ({
      SIGINT: process.listenerCount("SIGINT"),
      SIGTERM: process.listenerCount("SIGTERM"),
    });
    const before = countListeners();

    for (let restart = 0; restart < 3; restart++) {
      await Promise.all([first.listen(), second.listen()]);
      expect(countListeners()).toEqual({
        SIGINT: before.SIGINT + 1,
        SIGTERM: before.SIGTERM + 1,
      });
      await Promise.all([first.stop(), second.stop()]);
    }

    expect(countListeners()).toEqual(before);
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "stops the app, then exits, on %s",
    async (signal) => {
      const child = Bun.spawn(["bun", "test/fixtures/signal-app.ts"], {
        env: { ...Bun.env, NODE_ENV: "lyn-test" },
        stdout: "pipe",
      });
      const chunks = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
      let output = "";
      while (!output.includes("ready")) {
        const { value, done } = await chunks.read();
        if (done) break;
        output += value;
      }

      child.kill(signal);
      for (let chunk = await chunks.read(); !chunk.done; chunk = await chunks.read())
        output += chunk.value;
      await child.exited;

      expect(output).toContain("stopped");
      expect(child.signalCode).toBe(signal);
    }
  );

  it("logs a failed stop without the error message", async () => {
    const child = Bun.spawn(["bun", "test/fixtures/failing-stop-app.ts"], {
      env: { ...Bun.env, NODE_ENV: "production", LOG_LEVEL: "error" },
      stdout: "pipe",
    });
    const chunks = child.stdout.pipeThrough(new TextDecoderStream()).getReader();
    let output = "";
    while (!output.includes("ready")) {
      const { value, done } = await chunks.read();
      if (done) break;
      output += value;
    }

    child.kill("SIGTERM");
    for (let chunk = await chunks.read(); !chunk.done; chunk = await chunks.read())
      output += chunk.value;
    await child.exited;

    expect(output).toContain("Failed to stop the server");
    expect(output).not.toContain("hunter2");
  });
});
