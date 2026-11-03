import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DATABASE_URL", "postgres://test@localhost/test");
  vi.stubEnv("STORAGE_DRIVER", undefined);
  vi.stubEnv("SUPABASE_URL", undefined);
  vi.stubEnv("SUPABASE_SECRET_KEY", undefined);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function readConfig() {
  const { env } = await import("@/lib/server/env");
  return env();
}

describe("storage configuration", () => {
  it.each([undefined, "local"])("uses local storage without Supabase credentials: %s", async (driver) => {
    vi.stubEnv("STORAGE_DRIVER", driver);
    expect((await readConfig()).STORAGE_DRIVER).toBe("local");
    const { storage } = await import("@/integrations/storage/index");

    const { LocalStorage: CurrentLocalStorage } = await import("@/integrations/storage/local");
    expect(storage()).toBeInstanceOf(CurrentLocalStorage);
    expect(storage()).toBe(storage());
  });

  it.each([undefined, "", "  ", "not-a-url", "ftp://storage.example.com"])(
    "rejects missing or invalid Supabase URLs: %s",
    async (url) => {
      vi.stubEnv("STORAGE_DRIVER", "supabase");
      vi.stubEnv("SUPABASE_URL", url);
      vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
      await expect(readConfig()).rejects.toThrow("SUPABASE_URL");
    },
  );

  it.each([undefined, "", "  "])("rejects missing or blank server keys: %s", async (key) => {
    vi.stubEnv("STORAGE_DRIVER", "supabase");
    vi.stubEnv("SUPABASE_URL", "https://storage.example.com");
    vi.stubEnv("SUPABASE_SECRET_KEY", key);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
    const { storage } = await import("@/integrations/storage/index");
    expect(() => storage()).toThrow("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  });

  it.each(["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const)(
    "selects Supabase with %s",
    async (keyName) => {
      vi.stubEnv("STORAGE_DRIVER", "supabase");
      vi.stubEnv("SUPABASE_URL", "https://storage.example.com");
      vi.stubEnv(keyName, "test-server-key");
      const { storage } = await import("@/integrations/storage/index");
      const { SupabaseStorage: CurrentSupabaseStorage } = await import("@/integrations/storage/supabase");
      expect(storage()).toBeInstanceOf(CurrentSupabaseStorage);
      expect(storage()).toBe(storage());
    },
  );
});
