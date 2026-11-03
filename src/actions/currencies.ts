"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { CURRENCIES } from "@/domain/money";
import { ratesTo } from "@/services/currencies";

export const currencyRates = action(z.object({ base: z.enum(CURRENCIES) }), async (input) => ratesTo(input.base), {
  rateLimit: false,
  revalidate: false,
});
