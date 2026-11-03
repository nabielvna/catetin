import "server-only";

import { z } from "zod";

import { isLocalDate } from "@/domain/dates";
import { isCurrency } from "@/domain/money";
import type { FxProvider } from "@/integrations/currencies/types";

const responseSchema = z.object({
  result: z.literal("success"),
  base_code: z.literal("USD"),
  time_last_update_unix: z.number().int().positive(),
  rates: z
    .record(z.string(), z.number().positive())
    .refine(
      (rates) => rates.USD === 1 && Object.keys(rates).some((c) => c !== "USD" && isCurrency(c)),
      "Expected USD parity and at least one supported quote",
    ),
});

export const exchangeRateApi: FxProvider = {
  source: { id: "exchangerate-api", name: "ExchangeRate-API", url: "https://www.exchangerate-api.com" },
  async fetchRates() {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`exchangerate-api ${res.status}`);
    const data = responseSchema.parse(await res.json());
    const date = new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10);
    if (!isLocalDate(date)) throw new Error("Invalid exchangerate-api date");
    return { base: "USD", date, rates: data.rates, source: "exchangerate-api" };
  },
};
