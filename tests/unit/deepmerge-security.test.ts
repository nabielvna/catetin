import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const merge = createRequire(import.meta.resolve("shadcn"))("deepmerge") as (
  target: unknown,
  source: unknown,
) => Record<string | symbol, unknown>;

describe("deepmerge prototype poisoning regression", () => {
  it("does not inherit properties supplied through the target's own __proto__ key", () => {
    const target = JSON.parse('{"__proto__":{"isAdmin":true},"name":"safe"}');
    const result = merge(target, { enabled: true });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(result.isAdmin).toBeUndefined();
    expect(result.name).toBe("safe");
    expect(result.enabled).toBe(true);
    expect(Object.prototype).not.toHaveProperty("isAdmin");
  });

  it("handles null-prototype inputs and nested array objects without poisoning", () => {
    const source = Object.assign(Object.create(null), JSON.parse('{"__proto__":{"isAdmin":true}}'));
    const result = merge(Object.create(null), { items: [source], nested: source });
    for (const value of [result.nested, ...(result.items as unknown[])]) {
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
      expect(value).not.toHaveProperty("isAdmin");
    }
  });

  it("preserves ordinary nested, array, symbol and constructor data", () => {
    const symbol = Symbol("option");
    const result = merge(
      { nested: { a: 1 }, items: [1], [symbol]: { a: 1 }, constructor: { a: 1 } },
      { nested: { b: 2 }, items: [2], [symbol]: { b: 2 }, constructor: { b: 2 } },
    );
    expect(result).toEqual({
      nested: { a: 1, b: 2 },
      items: [1, 2],
      [symbol]: { a: 1, b: 2 },
      constructor: { a: 1, b: 2 },
    });
  });
});
