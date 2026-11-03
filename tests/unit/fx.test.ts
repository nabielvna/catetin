import { afterEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ FX_PROVIDER: "exchangerate-api", FX_FALLBACK_PROVIDER: "frankfurter" }));
vi.mock("@/lib/server/env", () => ({ env: () => config }));

import { exchangeRateApi } from "@/integrations/currencies/exchangerate-api";
import { frankfurter } from "@/integrations/currencies/frankfurter";
import { fetchFxRates, fxSource } from "@/integrations/currencies/index";

const exchangeResponse = {
  result: "success",
  base_code: "USD",
  time_last_update_unix: Date.UTC(2026, 9, 30, 23, 30) / 1000,
  rates: { USD: 1, IDR: 16000, EUR: 0.8 },
};
const frankfurterResponse = { amount: 1, base: "USD", date: "2026-10-30", rates: { IDR: 15900, EUR: 0.81 } };

afterEach(() => {
  vi.unstubAllGlobals();
  config.FX_PROVIDER = "exchangerate-api";
  config.FX_FALLBACK_PROVIDER = "frankfurter";
});

describe("FX provider adapters", () => {
  it("normalizes ExchangeRate-API's update timestamp to a UTC date", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(exchangeResponse)));
    expect(await exchangeRateApi.fetchRates()).toEqual({
      base: "USD",
      date: "2026-10-30",
      rates: exchangeResponse.rates,
      source: "exchangerate-api",
    });
  });

  it("preserves Frankfurter's working-day date and adds USD parity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(frankfurterResponse)));
    expect(await frankfurter.fetchRates()).toEqual({
      base: "USD",
      date: "2026-10-30",
      rates: { ...frankfurterResponse.rates, USD: 1 },
      source: "frankfurter",
    });
  });

  it.each([
    { ...exchangeResponse, result: "error" },
    { ...exchangeResponse, base_code: "EUR" },
    { ...exchangeResponse, time_last_update_unix: 0 },
    { ...exchangeResponse, rates: {} },
    { ...exchangeResponse, rates: { USD: 2, IDR: 16000 } },
    { ...exchangeResponse, rates: { USD: 1, IDR: -1 } },
    { ...exchangeResponse, rates: { USD: 1, IDR: "16000" } },
  ])("rejects malformed ExchangeRate-API data %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    await expect(exchangeRateApi.fetchRates()).rejects.toThrow();
  });

  it.each([
    { ...frankfurterResponse, base: "EUR" },
    { ...frankfurterResponse, amount: 10 },
    { ...frankfurterResponse, date: "2026-02-30" },
    { ...frankfurterResponse, rates: {} },
    { ...frankfurterResponse, rates: { EUR: 0 } },
  ])("rejects malformed Frankfurter data %#", async (data) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    await expect(frankfurter.fetchRates()).rejects.toThrow();
  });
});

describe("FX provider selection", () => {
  it("does not call the fallback when the primary succeeds, even with partial currency coverage", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(exchangeResponse));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchFxRates()).source).toBe("exchangerate-api");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(["network", "http", "invalid-json", "malformed"])("uses fallback after a %s failure", async (failure) => {
    const fetch = vi.fn();
    if (failure === "network") fetch.mockRejectedValueOnce(new Error("network unavailable"));
    else if (failure === "http") fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    else if (failure === "invalid-json") fetch.mockResolvedValueOnce(new Response("invalid"));
    else fetch.mockResolvedValueOnce(Response.json({ ...exchangeResponse, rates: {} }));
    fetch.mockResolvedValueOnce(Response.json(frankfurterResponse));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchFxRates()).source).toBe("frankfurter");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("allows Frankfurter as primary and ExchangeRate-API as fallback", async () => {
    config.FX_PROVIDER = "frankfurter";
    config.FX_FALLBACK_PROVIDER = "exchangerate-api";
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json(exchangeResponse));
    vi.stubGlobal("fetch", fetch);
    expect((await fetchFxRates()).source).toBe("exchangerate-api");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.frankfurter.dev/v1/latest?base=USD",
      "https://open.er-api.com/v6/latest/USD",
    ]);
  });

  it.each(["none", "exchangerate-api"])("does not retry when fallback is %s", async (fallback) => {
    config.FX_FALLBACK_PROVIDER = fallback;
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchFxRates()).rejects.toThrow("offline");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("propagates failure when both sources are unavailable", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary offline"))
      .mockRejectedValueOnce(new Error("fallback offline"));
    vi.stubGlobal("fetch", fetch);
    await expect(fetchFxRates()).rejects.toThrow("fallback offline");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("resolves attribution from stored source IDs and tolerates legacy/unknown sources", () => {
    expect(fxSource("frankfurter")).toEqual({ id: "frankfurter", name: "Frankfurter", url: "https://frankfurter.dev" });
    expect(fxSource("legacy")).toEqual({ id: "legacy", name: "legacy", url: null });
    expect(fxSource("toString").url).toBeNull();
  });
});
