import { rateLimitFeature } from "#lyn/features/rate-limit";
import { Lyn } from "#lyn/index";
import type { LynConfig } from "#lyn/types";
import { describe, expect, it } from "bun:test";
import { TEST_LYN_CONFIG } from "test/constantsTest";

const CLIENT_HEADER = "X-Client";

const createApp = (rateLimit: LynConfig["rateLimit"], cors?: LynConfig["cors"]) =>
  new Lyn({ ...TEST_LYN_CONFIG, rateLimit, cors }).get("/", () => "ok");

const keyFromHeader = (request: Request) => request.headers.get(CLIENT_HEADER) ?? undefined;

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

  it("limits by client IP by default", () => {
    const feature = rateLimitFeature({ rateLimit: { max: 1 } })!.create({ app: { nodeEnv: "test" }, own: {} });
    const request = () => new Request("http://lyn.test/");

    const first = feature.onRequest!(request(), { ip: "203.0.113.1" });
    const second = feature.onRequest!(request(), { ip: "203.0.113.1" });
    const otherClient = feature.onRequest!(request(), { ip: "203.0.113.2" });

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

  it.each([
    [{ max: 0 }, "rateLimit.max must be a positive integer"],
    [{ max: 1.5 }, "rateLimit.max must be a positive integer"],
    [{ max: 1, windowMs: 0 }, "rateLimit.windowMs must be a positive integer"],
  ])("rejects %p", (rateLimit, message) => {
    expect(() => createApp(rateLimit)).toThrow(message);
  });
});
