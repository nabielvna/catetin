"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { type AdjKey, type Adjustments, breakdown, switchUnit } from "@/domain/adjustments";
import { type Currency, currencySymbol, type Minor } from "@/domain/money";
import { intlLocale, money } from "@/lib/format";
import { cn } from "@/lib/utils";

const KEYS: AdjKey[] = ["discount", "service", "tax"];

export function AdjustmentFields({
  value,
  onChange,
  subtotal,
  currency,
  label,
  footer,
}: {
  value: Adjustments;
  onChange: (next: Adjustments, key: AdjKey) => void;
  subtotal: Minor;
  currency: Currency;
  label?: (key: AdjKey, text: string) => ReactNode;

  footer?: ReactNode;
}) {
  const t = useTranslations("adjust");
  const locale = useLocale();
  const symbol = currencySymbol(currency, intlLocale(locale));
  const b = breakdown(subtotal, value, currency);
  const fmt = (m: Minor) => money(m, currency, locale);
  const pctOf = (part: Minor, base: Minor) =>
    base > 0 && part > 0
      ? new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format((part / base) * 100) + "%"
      : "";

  return (
    <div className="flex flex-col gap-3">
      {KEYS.map((key) => {
        const f = value[key];
        const text = t(key);
        return (
          <div key={key} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2">
            <label htmlFor={`adj-${key}`} className="flex items-center gap-1.5 text-sm font-medium">
              {label ? label(key, text) : text}
            </label>
            <Input
              id={`adj-${key}`}
              inputMode="decimal"
              className="text-right"
              value={f.raw}
              placeholder="0"
              onChange={(e) => onChange({ ...value, [key]: { ...f, raw: e.target.value } }, key)}
            />
            <div role="radiogroup" aria-label={t("unit")} className="flex h-12 gap-0.5 rounded-md bg-soft p-1">
              {(["PCT", "AMT"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={f.unit === u}
                  onClick={() =>
                    f.unit !== u && onChange({ ...value, [key]: switchUnit(key, value, subtotal, currency) }, key)
                  }
                  className={cn(
                    "min-w-10 rounded-sm px-2 text-sm font-semibold transition-colors",
                    f.unit === u ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {u === "PCT" ? "%" : symbol}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-1 flex flex-col gap-1.5 rounded-xl bg-soft px-4 py-3.5 text-[15px]" aria-live="polite">
        <Row label={t("subtotal")} value={fmt(subtotal)} />
        {b && b.discount > 0 ? (
          <Row label={t("discount")} hint={pctOf(b.discount, b.subtotal)} value={`−${fmt(b.discount)}`} />
        ) : null}
        {b && b.service > 0 ? (
          <Row label={t("service")} hint={pctOf(b.service, b.subtotal - b.discount)} value={fmt(b.service)} />
        ) : null}
        {b && b.tax > 0 ? (
          <Row label={t("tax")} hint={pctOf(b.tax, b.subtotal - b.discount + b.service)} value={fmt(b.tax)} />
        ) : null}
        <div className="my-1 border-t border-foreground/10" />
        <Row label={t("total")} value={b ? fmt(b.total) : "—"} strong />
        {footer}
      </div>
    </div>
  );
}

function Row({ label, hint, value, strong }: { label: string; hint?: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", strong && "text-[17px] font-bold")}>
      <span className={cn(!strong && "text-muted-foreground")}>
        {label}
        {hint ? <span className="ml-1.5 text-[13px]">{hint}</span> : null}
      </span>
      <span className={cn("num", !strong && "font-medium")}>{value}</span>
    </div>
  );
}
