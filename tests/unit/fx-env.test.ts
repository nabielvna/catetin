import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function readConfig(primary?: string, fallback?: string) {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://test@localhost/test");
  vi.stubEnv("FX_PROVIDER", primary);
  vi.stubEnv("FX_FALLBACK_PROVIDER", fallback);
  const { env } = await import("@/lib/server/env");
  return env();
}

describe("optional FX configuration", () => {
  it.each([undefined, "", "  "])("preserves the existing order when unset/blank: %s", async (value) => {
    const config = await readConfig(value, value);
    expect(config.FX_PROVIDER).toBe("exchangerate-api");
    expect(config.FX_FALLBACK_PROVIDER).toBe("frankfurter");
  });

  it("accepts another primary and disabled fallback", async () => {
    const config = await readConfig("frankfurter", "none");
    expect(config.FX_PROVIDER).toBe("frankfurter");
    expect(config.FX_FALLBACK_PROVIDER).toBe("none");
  });

  it("rejects unknown providers", async () => {
    await expect(readConfig("unknown")).rejects.toThrow("FX_PROVIDER");
    await expect(readConfig("frankfurter", "unknown")).rejects.toThrow("FX_FALLBACK_PROVIDER");
  });
});
