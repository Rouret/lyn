import { test, describe, expect } from "bun:test";
import { getDefaultStatusFromMethod } from "#/utils";

describe("Unit tests for utils", () => {
  test("getDefaultStatusFromMethod should return 200 for GET", () => {
    expect(getDefaultStatusFromMethod("GET")).toBe(200);
    expect(getDefaultStatusFromMethod("DELETE")).toBe(204);
    expect(getDefaultStatusFromMethod("POST")).toBe(201);
    expect(getDefaultStatusFromMethod("PUT")).toBe(200);
  });
});
