import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/database/client";
import { fxRate } from "@/database/schema";
import { CURRENCIES, type Currency } from "@/domain/money";
import { fetchFxRates } from "@/integrations/currencies";
import { fxSource } from "@/integrations/currencies/index";
import type { FxRates } from "@/integrations/currencies/types";
import { log } from "@/lib/server/logger";

export async function latestRate(from: Currency, to: Currency): Promise<string | null> {
  if (from === to) return "1";
  const [row] = await db.execute<{ f: string; t: string }>(sql`
    select f.rate as f, t.rate as t from fx_rate f join fx_rate t on t.day = f.day and t.base = f.base
    where f.base = 'USD' and f.quote = ${from} and t.quote = ${to}
    order by f.day desc limit 1`);
  if (!row) return null;
  const r = Number(row.t) / Number(row.f);
  return r.toPrecision(10).replace(/\.?0+$/, "");
}

let refreshing: Promise<unknown> | null = null;

export async function ratesTo(base: Currency): Promise<FxRates> {
  const load = () =>
    db.execute<{ day: string; quote: string; rate: string; source: string }>(sql`
      select day::text as day, quote, rate::text as rate, source from fx_rate
      where base = 'USD' and day = (select max(day) from fx_rate where base = 'USD')`);
  let rows = await load();
  if (rows.length === 0) {
    refreshing ??= refreshFxRates().finally(() => {
      refreshing = null;
    });
    await refreshing.catch((err) => log.warn({ err }, "on-demand fx refresh failed"));
    rows = await load();
  }
  const usd = new Map(rows.map((r) => [r.quote, Number(r.rate)]));
  const b = usd.get(base);
  if (!b) return { day: rows[0]?.day ?? null, rates: {}, sources: [] };
  const rates: Record<string, number> = {};
  for (const [quote, r] of usd) if (r > 0) rates[quote] = b / r;
  const sources = [...new Set(rows.map((r) => r.source))].sort().map(fxSource);
  return { day: rows[0]?.day ?? null, rates, sources };
}

export async function refreshFxRates(now = new Date()): Promise<{ source: string; count: number }> {
  const snapshot = await fetchFxRates();
  const rows = CURRENCIES.filter((c) => snapshot.rates[c] !== undefined).map((c) => ({
    day: snapshot.date,
    base: snapshot.base,
    quote: c,
    rate: snapshot.rates[c]!.toFixed(10).replace(/\.?0+$/, ""),
    source: snapshot.source,
    fetchedAt: now,
  }));
  if (rows.length) await db.insert(fxRate).values(rows).onConflictDoNothing();
  return { source: snapshot.source, count: rows.length };
}
