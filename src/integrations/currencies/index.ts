import "server-only";

import { exchangeRateApi } from "@/integrations/currencies/exchangerate-api";
import { frankfurter } from "@/integrations/currencies/frankfurter";
import type { FxProvider, FxProviderId, FxSnapshot, FxSource } from "@/integrations/currencies/types";
import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";

const providers: Record<FxProviderId, FxProvider> = { "exchangerate-api": exchangeRateApi, frankfurter };

export function fxSource(id: string): FxSource {
  return Object.hasOwn(providers, id) ? providers[id as FxProviderId].source : { id, name: id, url: null };
}

export async function fetchFxRates(): Promise<FxSnapshot> {
  const { FX_PROVIDER: primary, FX_FALLBACK_PROVIDER: fallback } = env();
  try {
    return await providers[primary].fetchRates();
  } catch (err) {
    if (fallback === "none" || fallback === primary) throw err;
    log.warn({ err, primary, fallback }, "fx provider failed, trying fallback");
    return providers[fallback].fetchRates();
  }
}
