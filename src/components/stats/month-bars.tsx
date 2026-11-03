"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import type { MonthBar } from "@/domain/stats";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MonthBars({
  months,
  currency,
  legendUp,
  legendDown,
  valuesKey = "monthValues",
}: {
  months: MonthBar[];
  currency: string;
  legendUp: string;
  legendDown: string;
  valuesKey?: "monthValues" | "personMonthValues";
}) {
  const t = useTranslations("stats");
  const locale = useLocale();

  const [sel, setSel] = useState(() => {
    const i = months.findLastIndex((m) => m.lent || m.borrowed);
    return i >= 0 ? i : months.length - 1;
  });
  const maxUp = Math.max(1, ...months.map((m) => m.lent));
  const maxDown = Math.max(1, ...months.map((m) => m.borrowed));
  const label = (month: string, style: "short" | "long") =>
    new Intl.DateTimeFormat(locale, {
      month: style,
      ...(style === "long" ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(`${month}-01T00:00:00Z`));
  const s = months[sel]!;

  return (
    <div className="flex flex-col">
      <div className="flex gap-3.5 pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-pos" aria-hidden />
          {legendUp}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-neg" aria-hidden />
          {legendDown}
        </span>
      </div>
      <div className="flex min-h-10 flex-col gap-0.5 pt-3" aria-live="polite">
        <span className="text-sm font-bold capitalize">{label(s.month, "long")}</span>
        <span className="text-[13px] num text-muted-foreground">
          {t(valuesKey, { lent: money(s.lent, currency, locale), borrowed: money(s.borrowed, currency, locale) })}
        </span>
      </div>
      <div className="relative mt-2 grid h-47.5 grid-cols-6 gap-2">
        <span className="absolute inset-x-0 top-30 h-px bg-border" aria-hidden />
        {months.map((m, i) => (
          <button
            key={m.month}
            type="button"
            aria-pressed={i === sel}
            aria-label={`${label(m.month, "long")}: ${t(valuesKey, {
              lent: money(m.lent, currency, locale),
              borrowed: money(m.borrowed, currency, locale),
            })}`}
            onClick={() => setSel(i)}
            className={cn("relative h-full rounded-md", i === sel && "bg-soft")}
          >
            {m.lent > 0 ? (
              <span
                className="absolute inset-x-[22%] bottom-17.5 rounded-t-[4px] bg-pos"
                style={{ height: Math.max(2, Math.round((m.lent / maxUp) * 96)) }}
              />
            ) : null}
            {m.borrowed > 0 ? (
              <span
                className="absolute inset-x-[22%] top-30.5 rounded-b-[4px] bg-neg"
                style={{ height: Math.max(2, Math.round((m.borrowed / maxDown) * 44)) }}
              />
            ) : null}
            <span
              className={cn(
                "absolute inset-x-0 bottom-0 text-[11px] font-semibold capitalize",
                i === sel ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label(m.month, "short")}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
