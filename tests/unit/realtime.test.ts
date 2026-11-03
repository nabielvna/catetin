import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pg: vi.fn(), supabase: vi.fn(), warn: vi.fn(), driver: "pg" }));
vi.mock("@/integrations/realtime/postgres", () => ({ publishPostgres: mocks.pg }));
vi.mock("@/integrations/realtime/supabase", () => ({ publishSupabase: mocks.supabase }));
vi.mock("@/lib/server/env", () => ({ env: () => ({ REALTIME_DRIVER: mocks.driver }) }));
vi.mock("@/lib/server/logger", () => ({ log: { warn: mocks.warn } }));
import { publish } from "@/integrations/realtime/server";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.driver = "pg";
});

describe("realtime delivery", () => {
  it("deduplicates recipients", async () => {
    await publish(["a", "b", "a"], { scope: "inbox" });
    expect(mocks.pg).toHaveBeenCalledWith(["a", "b"], { scope: "inbox" });
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
  it("selects the Supabase provider", async () => {
    mocks.driver = "supabase";
    await publish(["a"], { scope: "ledger" });
    expect(mocks.supabase).toHaveBeenCalledWith(["a"], { scope: "ledger" });
  });
  it("allows realtime to be disabled", async () => {
    mocks.driver = "none";
    await publish(["a"], { scope: "ledger" });
    expect(mocks.pg).not.toHaveBeenCalled();
    expect(mocks.supabase).not.toHaveBeenCalled();
  });
  it("does not fail an already committed mutation when delivery fails", async () => {
    mocks.pg.mockRejectedValue(new Error("offline"));
    await expect(publish(["a"], { scope: "ledger" })).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalled();
  });
});
