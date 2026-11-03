export const FX_PROVIDERS = ["exchangerate-api", "frankfurter"] as const;
export type FxProviderId = (typeof FX_PROVIDERS)[number];

export type FxSnapshot = { base: "USD"; date: string; rates: Record<string, number>; source: FxProviderId };

export type FxSource = { id: string; name: string; url: string | null };

export interface FxProvider {
  source: FxSource;
  fetchRates(): Promise<FxSnapshot>;
}

export type FxRates = { day: string | null; rates: Record<string, number>; sources: FxSource[] };
