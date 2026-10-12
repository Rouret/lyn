import { isRequestHostAllowed, resolveAllowedHosts } from "#lyn/host";
import { describe, expect, it } from "bun:test";

const requestWithHost = (host?: string) =>
  new Request("http://127.0.0.1/", host === undefined ? {} : { headers: { host } });

const isAllowed = (host: string | undefined, allowedHosts: string[]) =>
  isRequestHostAllowed(requestWithHost(host), new Set(allowedHosts));

describe("resolveAllowedHosts", () => {
  it("allows the loopback names by default", () => {
    expect(resolveAllowedHosts("127.0.0.1")).toEqual(
      new Set(["127.0.0.1", "localhost", "::1"])
    );
  });

  it("adds a specific bind address", () => {
    expect(resolveAllowedHosts("192.168.1.10")).toEqual(
      new Set(["127.0.0.1", "localhost", "::1", "192.168.1.10"])
    );
  });

  it.each(["0.0.0.0", "::"])("does not add the wildcard bind address %s", (bind) => {
    expect(resolveAllowedHosts(bind)).toEqual(
      new Set(["127.0.0.1", "localhost", "::1"])
    );
  });

  it("replaces the loopback names with the configured hosts", () => {
    expect(resolveAllowedHosts("0.0.0.0", ["api.example.com"])).toEqual(
      new Set(["api.example.com"])
    );
  });

  it("keeps the bind address next to the configured hosts", () => {
    expect(resolveAllowedHosts("10.0.0.5", ["api.example.com"])).toEqual(
      new Set(["api.example.com", "10.0.0.5"])
    );
  });

  it("trims and lowercases the configured hosts", () => {
    expect(resolveAllowedHosts("0.0.0.0", ["  API.Example.COM "])).toEqual(
      new Set(["api.example.com"])
    );
  });

  it("rejects an empty list", () => {
    expect(() => resolveAllowedHosts("0.0.0.0", [])).toThrow(
      "server.allowedHosts must list at least one host"
    );
  });

  it.each(["", "   "])("rejects a blank host %p", (blank) => {
    expect(() => resolveAllowedHosts("0.0.0.0", ["api.example.com", blank])).toThrow(
      "server.allowedHosts must not contain a blank host"
    );
  });
});

describe("isRequestHostAllowed", () => {
  const allowed = ["app.test", "127.0.0.1", "::1"];

  it.each([
    ["a name without a port", "app.test"],
    ["the served port", "app.test:3000"],
    ["another port", "app.test:8080"],
    ["port 0", "app.test:0"],
    ["the highest port", "app.test:65535"],
    ["an uppercase name", "APP.Test"],
    ["surrounding spaces", "  app.test:3000  "],
    ["an IPv4 address", "127.0.0.1:3000"],
    ["a bracketed IPv6 address", "[::1]"],
    ["a bracketed IPv6 address with a port", "[::1]:3000"],
  ])("accepts %s (%p)", (_, host) => {
    expect(isAllowed(host, allowed)).toBe(true);
  });

  it.each([
    ["a name that is not listed", "evil.example"],
    ["a subdomain of an allowed name", "sub.app.test"],
    ["an allowed name used as a prefix", "app.test.evil.example"],
    ["an allowed name used as a suffix", "evilapp.test"],
    ["credentials in front of an allowed name", "evil.example:@app.test"],
    ["an allowed name in front of credentials", "app.test@evil.example"],
    ["an empty value", ""],
    ["a port without a name", ":3000"],
    ["a colon without a port", "app.test:"],
    ["a port that is not a number", "app.test:abc"],
    ["a negative port", "app.test:-1"],
    ["a port above 65535", "app.test:65536"],
    ["a port with a sign", "app.test:+80"],
    ["two ports", "app.test:80:80"],
    ["an unbracketed IPv6 address", "::1"],
    ["empty brackets", "[]"],
    ["an unclosed bracket", "[::1"],
    ["text after the brackets", "[::1]x"],
    ["a bracketed address with an invalid port", "[::1]:abc"],
    ["a bracketed address with an empty port", "[::1]:"],
    ["a bracketed address that is not listed", "[::2]"],
  ])("refuses %s (%p)", (_, host) => {
    expect(isAllowed(host, allowed)).toBe(false);
  });

  it("refuses a request without a Host header", () => {
    expect(isAllowed(undefined, allowed)).toBe(false);
  });
});
