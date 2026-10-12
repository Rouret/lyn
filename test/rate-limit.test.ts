import { TooManyRequestsError } from "#lyn/error";
import { rateLimitFeature } from "#lyn/features/rate-limit";
import { Lyn } from "#lyn/index";
import type { LynConfig } from "#lyn/types";
import { describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";

const CLIENT_HEADER = "X-Client";

const createApp = (rateLimit: LynConfig["rateLimit"], cors?: LynConfig["cors"]) =>
  new Lyn({ ...TEST_LYN_CONFIG, rateLimit, cors }).get("/", () => "ok");

const keyFromHeader = (request: Request) => request.headers.get(CLIENT_HEADER) ?? undefined;

const createOnRequest = (rateLimit: NonNullable<LynConfig["rateLimit"]>) =>
  rateLimitFeature({ rateLimit })!.create({ app: { nodeEnv: "test" }, own: {} }).onRequest!;

const request = () => new Request("http://lyn.test/");

const preflight = () =>
  new Request("http://lyn.test/", {
    method: "OPTIONS",
    headers: {
      [CLIENT_HEADER]: "alice",
      Origin: "https://app.test",
      "Access-Control-Request-Method": "POST",
    },
  });

const send = (app: Lyn, client = "alice", path = "/", headers: Record<string, string> = {}) =>
  app.handle(
    new Request(`http://lyn.test${path}`, { headers: { [CLIENT_HEADER]: client, ...headers } })
  );

describe("rateLimit", () => {
  it("answers 429 with Retry-After once a client exceeds max", async () => {
    const app = createApp({ max: 2, windowMs: 60_000, key: keyFromHeader });

    const statuses = [(await send(app)).status, (await send(app)).status];
    const limited = await send(app);

    expect(statuses).toEqual([200, 200]);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await limited.json()).toEqual({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests, retry later",
    });
  });

  it("counts each client separately", async () => {
    const app = createApp({ max: 1, key: keyFromHeader });

    const statuses = [(await send(app, "alice")).status, (await send(app, "bob")).status];

    expect(statuses).toEqual([200, 200]);
  });

  it("counts requests to unknown routes", async () => {
    const app = createApp({ max: 1, key: keyFromHeader });

    const first = await send(app, "alice", "/missing");
    const second = await send(app, "alice", "/");

    expect(first.status).toBe(404);
    expect(second.status).toBe(429);
  });

  it("gives a new budget after the window", async () => {
    const app = createApp({ max: 1, windowMs: 30, key: keyFromHeader });

    await send(app);
    const limited = await send(app);
    await Bun.sleep(40);
    const renewed = await send(app);

    expect(limited.status).toBe(429);
    expect(renewed.status).toBe(200);
  });

  it("never limits a request whose key is undefined", async () => {
    const app = createApp({ max: 1, key: () => undefined });

    const statuses = [(await send(app)).status, (await send(app)).status];

    expect(statuses).toEqual([200, 200]);
  });

  it("keys on the client IP by default, so handle() without a server is not limited", async () => {
    const app = createApp({ max: 1 });

    const statuses = [(await send(app)).status, (await send(app)).status];

    expect(statuses).toEqual([200, 200]);
  });

  it("limits by client IP by default", async () => {
    const onRequest = createOnRequest({ max: 1 });

    const first = await onRequest(request(), { ip: "203.0.113.1" });
    const second = await onRequest(request(), { ip: "203.0.113.1" });
    const otherClient = await onRequest(request(), { ip: "203.0.113.2" });

    expect(first).toBeUndefined();
    expect(second?.status).toBe(429);
    expect(otherClient).toBeUndefined();
  });

  it("sends CORS headers on a 429", async () => {
    const app = createApp({ max: 1, key: keyFromHeader }, { origin: ["https://app.test"] });

    await send(app);
    const limited = await send(app, "alice", "/", { Origin: "https://app.test" });

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Access-Control-Allow-Origin")).toBe("https://app.test");
  });

  it("lets skipped requests through without counting them", async () => {
    const app = createApp({
      max: 1,
      key: keyFromHeader,
      skip: (request) => request.headers.get("X-Plan") === "premium",
    });

    const premium = [
      (await send(app, "alice", "/", { "X-Plan": "premium" })).status,
      (await send(app, "alice", "/", { "X-Plan": "premium" })).status,
    ];
    const free = [(await send(app)).status, (await send(app)).status];

    expect(premium).toEqual([200, 200]);
    expect(free).toEqual([200, 429]);
  });

  it("awaits an async skip and key", async () => {
    const app = createApp({
      max: 1,
      key: async (request) => keyFromHeader(request),
      skip: async () => false,
    });

    const statuses = [(await send(app)).status, (await send(app)).status];

    expect(statuses).toEqual([200, 429]);
  });

  it("answers 500 when key throws", async () => {
    const app = createApp({
      max: 1,
      key: () => {
        throw new Error("boom");
      },
    });

    const response = await send(app);

    expect(response.status).toBe(500);
    expect(response.headers.get("X-Request-Id")).not.toBeNull();
    expect(await response.json()).toEqual({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal Server Error",
    });
  });

  it("answers with the LynError thrown by skip", async () => {
    const app = createApp({
      max: 1,
      skip: () => {
        throw new TooManyRequestsError(5);
      },
    });

    const response = await send(app);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("5");
  });

  it("never counts CORS preflights", async () => {
    const app = new Lyn({
      ...TEST_LYN_CONFIG,
      cors: { origin: ["https://app.test"] },
      rateLimit: { max: 1, key: keyFromHeader },
    }).post("/", () => "ok");

    const preflights = [(await app.handle(preflight())).status, (await app.handle(preflight())).status];
    const post = await app.handle(
      new Request("http://lyn.test/", { method: "POST", headers: { [CLIENT_HEADER]: "alice" } })
    );

    expect(preflights).toEqual([204, 204]);
    expect(post.status).toBe(201);
  });

  it("keeps counting a client across one generation of 100000 new clients", async () => {
    const onRequest = createOnRequest({ max: 1 });
    await onRequest(request(), { ip: "first" });

    for (let index = 0; index < 100_000; index++)
      await onRequest(request(), { ip: `client-${index}` });
    const afterOneGeneration = await onRequest(request(), { ip: "first" });

    expect(afterOneGeneration?.status).toBe(429);
  });

  it("forgets the oldest clients after two generations of new clients, to bound memory", async () => {
    const onRequest = createOnRequest({ max: 1 });
    await onRequest(request(), { ip: "first" });

    for (let index = 0; index < 200_000; index++)
      await onRequest(request(), { ip: `client-${index}` });
    const afterTwoGenerations = await onRequest(request(), { ip: "first" });

    expect(afterTwoGenerations).toBeUndefined();
  });

  it.each([
    [{ max: 0 }, "rateLimit.max must be a positive integer"],
    [{ max: 1.5 }, "rateLimit.max must be a positive integer"],
    [{ max: 1, windowMs: 0 }, "rateLimit.windowMs must be a positive integer"],
  ])("rejects %p", (rateLimit, message) => {
    expect(() => createApp(rateLimit)).toThrow(message);
  });
});
