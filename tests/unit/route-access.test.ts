import { readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isGuestOnlyPath, isProtectedPath } from "@/lib/route-access";

describe("route access", () => {
  it("protects every page in the (main) group", () => {
    const dir = join(__dirname, "../../src/app/[locale]/(main)");
    const pages = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(pages.length).toBeGreaterThan(0);
    for (const d of pages) {
      expect(isProtectedPath(`/${d.name}`), `/${d.name}`).toBe(true);
      expect(isProtectedPath(`/${d.name}/x`), `/${d.name}/x`).toBe(true);
    }
    expect(isProtectedPath("/onboarding")).toBe(true);
  });

  it("leaves public pages open and doesn't match by prefix only", () => {
    for (const p of ["/", "/login", "/invite/tok", "/privacy", "/terms", "/homepage", "/statsx"]) {
      expect(isProtectedPath(p), p).toBe(false);
    }
  });

  it("sends signed-in users away only from the landing and login pages", () => {
    expect(isGuestOnlyPath("/")).toBe(true);
    expect(isGuestOnlyPath("/login")).toBe(true);
    expect(isGuestOnlyPath("/invite/tok")).toBe(false);
  });
});
