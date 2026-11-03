import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import id from "@/i18n/messages/id.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n", () => {
  it("Indonesian & English keys match exactly", () => {
    expect(keys(en).sort()).toEqual(keys(id).sort());
  });
});
