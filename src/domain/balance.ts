import type { Currency, Minor, MoneyByCurrency } from "@/domain/money";

export type OpenAmount = {
  creditorId: string;
  debtorId: string;
  currency: Currency;

  remaining: Minor;
};

export type BalanceSummary = {
  owedToMe: MoneyByCurrency;

  iOwe: MoneyByCurrency;

  net: MoneyByCurrency;
};

export function summarize(partyId: string, rows: readonly OpenAmount[]): BalanceSummary {
  const owedToMe: MoneyByCurrency = {};
  const iOwe: MoneyByCurrency = {};
  const net: MoneyByCurrency = {};
  for (const r of rows) {
    if (r.remaining <= 0) continue;
    if (r.creditorId === partyId) {
      owedToMe[r.currency] = (owedToMe[r.currency] ?? 0) + r.remaining;
      net[r.currency] = (net[r.currency] ?? 0) + r.remaining;
    } else if (r.debtorId === partyId) {
      iOwe[r.currency] = (iOwe[r.currency] ?? 0) + r.remaining;
      net[r.currency] = (net[r.currency] ?? 0) - r.remaining;
    }
  }
  return { owedToMe, iOwe, net };
}

export function approximateTotal(
  amounts: MoneyByCurrency,
  target: Currency,
  minorRates: Partial<Record<Currency, number>>,
): { total: Minor; missing: Currency[] } {
  let total = 0;
  const missing: Currency[] = [];
  for (const [c, v] of Object.entries(amounts) as Array<[Currency, Minor]>) {
    if (c === target) total += v;
    else if (minorRates[c] !== undefined) total += Math.round(v * (minorRates[c] ?? 0));
    else missing.push(c);
  }
  return { total, missing };
}
