import "server-only";

import { z } from "zod";

import { isLocalDate } from "@/domain/dates";
import { isCurrency } from "@/domain/money";
import type { FxProvider } from "@/integrations/currencies/types";

const responseSchema = z.object({
  amount: z.literal(1),
  base: z.literal("USD"),
  date: z.string().refine(isLocalDate, "Invalid Frankfurter date"),
  rates: z
    .record(z.string(), z.number().positive())
    .refine(
      (rates) =>
        (rates.USD === undefined || rates.USD === 1) && Object.keys(rates).some((c) => c !== "USD" && isCurrency(c)),
      "Expected at least one supported quote and USD parity if present",
    ),
});

export const frankfurter: FxProvider = {
  source: { id: "frankfurter", name: "Frankfurter", url: "https://frankfurter.dev" },
  async fetchRates() {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?base=USD", {
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const data = responseSchema.parse(await res.json());
    return { base: "USD", date: data.date, rates: { ...data.rates, USD: 1 }, source: "frankfurter" };
  },
};
