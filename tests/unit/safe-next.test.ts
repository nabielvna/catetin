import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("passes internal paths through as-is", () => {
    expect(safeNextPath("/people/abc?invite=1#x")).toBe("/people/abc?invite=1#x");
    expect(safeNextPath("/invite/tok")).toBe("/invite/tok");
  });

  it("rejects other sites' addresses (open redirect)", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "/\t/evil.com",
      "https://evil.com",
      "evil.com",
      "javascript:alert(1)",
    ]) {
      expect(safeNextPath(bad)).toBe("/home");
    }
  });

  it("empty → fallback", () => {
    expect(safeNextPath(null)).toBe("/home");
    expect(safeNextPath(undefined, "/people")).toBe("/people");
  });
});
