import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/database/client";
import { fxRate } from "@/database/schema/index";
import { latestRate, ratesTo } from "@/services/currencies";
import { refreshFxRates } from "@/services/currencies";

const DAY = "2099-01-01";
const PROVIDER_DAY = "2099-01-02";
const FALLBACK_DAY = "2099-01-03";

describe("rates for the currency picker (D-70)", () => {
  afterAll(async () => {
    await db.delete(fxRate).where(inArray(fxRate.day, [DAY, PROVIDER_DAY, FALLBACK_DAY]));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("all rates computed against the main currency from the latest day's USD rates", async () => {
    await db.insert(fxRate).values(
      [
        ["USD", "1"],
        ["IDR", "16000"],
        ["EUR", "0.8"],
        ["JPY", "150"],
      ].map(([quote, rate]) => ({ day: DAY, base: "USD", quote: quote!, rate: rate!, source: "test" })),
    );
    const { day, rates } = await ratesTo("IDR");
    expect(day).toBe(DAY);
    expect(rates.USD).toBeCloseTo(16000);
    expect(rates.EUR).toBeCloseTo(20000);
    expect(rates.JPY).toBeCloseTo(106.667, 2);
    expect(rates.IDR).toBe(1);

    const eur = await ratesTo("EUR");
    expect(eur.rates.IDR).toBeCloseTo(0.00005);
    expect(eur.sources).toEqual([{ id: "test", name: "test", url: null }]);
    expect(await latestRate("EUR", "IDR")).toBe("20000");
    expect(await latestRate("USD", "USD")).toBe("1");
  });

  it("persists the provider's effective date separately from retrieval time and reads its attribution", async () => {
    const fetchedAt = new Date("2099-01-04T12:00:00Z");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Response.json({
            result: "success",
            base_code: "USD",
            time_last_update_unix: new Date(`${PROVIDER_DAY}T01:00:00Z`).getTime() / 1000,
            rates: { USD: 1, IDR: 16000, EUR: 0.8, UNKNOWN: 42 },
          }),
        ),
    );
    expect(await refreshFxRates(fetchedAt)).toEqual({ source: "exchangerate-api", count: 3 });
    const rows = await db.select().from(fxRate).where(eq(fxRate.day, PROVIDER_DAY));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.fetchedAt.getTime() === fetchedAt.getTime() && r.source === "exchangerate-api")).toBe(
      true,
    );
    const result = await ratesTo("IDR");
    expect(result.day).toBe(PROVIDER_DAY);
    expect(result.rates.EUR).toBe(20000);
    expect(result.sources).toEqual([
      { id: "exchangerate-api", name: "ExchangeRate-API", url: "https://www.exchangerate-api.com" },
    ]);
    expect(await latestRate("EUR", "IDR")).toBe("20000");

    await refreshFxRates(new Date("2099-01-05T00:00:00Z"));
    expect(await db.select().from(fxRate).where(eq(fxRate.day, PROVIDER_DAY))).toHaveLength(3);
  });

  it("stores the fallback snapshot and retains attribution when a day contains both sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(Response.json({ amount: 1, base: "USD", date: FALLBACK_DAY, rates: { EUR: 0.8 } })),
    );
    expect(await refreshFxRates()).toEqual({ source: "frankfurter", count: 2 });
    const fallback = await ratesTo("EUR");
    expect(fallback.day).toBe(FALLBACK_DAY);
    expect(fallback.rates.USD).toBe(0.8);
    expect(fallback.sources.map((s) => s.id)).toEqual(["frankfurter"]);

    expect((await ratesTo("IDR")).rates).toEqual({});

    await db
      .insert(fxRate)
      .values({ day: FALLBACK_DAY, base: "USD", quote: "IDR", rate: "16000", source: "exchangerate-api" });
    expect((await ratesTo("IDR")).sources.map((s) => s.id)).toEqual(["exchangerate-api", "frankfurter"]);
  });

  it("does not change stored rates when both providers fail", async () => {
    const load = () =>
      db
        .select()
        .from(fxRate)
        .where(inArray(fxRate.day, [DAY, PROVIDER_DAY, FALLBACK_DAY]))
        .orderBy(fxRate.day, fxRate.quote);
    const before = await load();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(refreshFxRates()).rejects.toThrow("offline");
    expect(await load()).toEqual(before);
  });
});
