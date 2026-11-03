import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import * as schema from "@/database/schema";

describe("database schema", () => {
  it("exposes all 39 SQL tables without duplicate names", () => {
    const tables = (Object.values(schema) as unknown[]).filter((value): value is PgTable => is(value, PgTable));
    expect(tables).toHaveLength(39);
    expect(new Set(tables.map((table) => getTableConfig(table).name)).size).toBe(39);
    for (const table of tables) {
      const config = getTableConfig(table);
      expect(config.columns.length).toBeGreaterThan(0);
      for (const key of config.foreignKeys) expect(key.reference().foreignTable).toBeDefined();
    }
  });

  it.each(["debts", "payments", "bills"])("can initialize from the %s module", async (name) => {
    vi.resetModules();
    const modules = {
      debts: () => import("@/database/schema/debts"),
      payments: () => import("@/database/schema/payments"),
      bills: () => import("@/database/schema/bills"),
    };
    await expect(modules[name as keyof typeof modules]()).resolves.toBeDefined();
  });
});
