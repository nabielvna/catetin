import { describe, expect, it } from "vitest";

import { testDatabaseUrl } from "../helpers/database-url";

describe("test database URL", () => {
  it.each(["catetin_test", "catetin_test_ci", "catetin_e2e", "catetin_e2e_browser"])(
    "accepts the dedicated database %s",
    (name) => {
      const url = `postgres://test:test@localhost:5432/${name}`;
      expect(testDatabaseUrl(url)).toBe(url);
    },
  );

  it.each([
    undefined,
    "not-a-url",
    "postgres://localhost/catetin",
    "postgres://localhost/catetin_testproduction",
    "https://localhost/catetin_test",
  ])("rejects missing or unsafe database URLs", (url) => expect(() => testDatabaseUrl(url)).toThrow());

  it("requires a browser database for browser tests", () => {
    expect(() => testDatabaseUrl("postgres://localhost/catetin_test", "browser")).toThrow();
    const url = "postgresql://localhost/catetin_e2e_ci";
    expect(testDatabaseUrl(url, "browser")).toBe(url);
  });
});
