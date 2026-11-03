import { describe, expect, it } from "vitest";

import { EMAIL_MAX, NAME_MAX, normalizeEmail, normalizeName } from "@/domain/people";

describe("person input", () => {
  it("normalizes whitespace without removing characters from names", () => {
    expect(normalizeName("  Ani\t Putri\n ")).toBe("Ani Putri");
    expect(normalizeName("O'Connor")).toBe("O'Connor");
    expect(normalizeName("a".repeat(NAME_MAX))).toHaveLength(NAME_MAX);
  });
  it.each(["", " \n ", "a".repeat(NAME_MAX + 1)])("rejects invalid names: %s", (value) => {
    expect(() => normalizeName(value)).toThrow("INVALID_INPUT");
  });
  it("normalizes optional email addresses", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("  ")).toBeNull();
    expect(normalizeEmail(" ANI@Example.com ")).toBe("ani@example.com");
  });
  it.each(["invalid", "a@b", "a b@example.com", "a".repeat(EMAIL_MAX) + "@example.com"])(
    "rejects invalid email: %s",
    (value) => {
      expect(() => normalizeEmail(value)).toThrow("INVALID_INPUT");
    },
  );
});
