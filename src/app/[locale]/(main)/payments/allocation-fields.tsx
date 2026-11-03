"use client";

import { useLocale, useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { type Allocation } from "@/domain/allocation";
import { type Currency } from "@/domain/money";
import { money } from "@/lib/format";
import type { PaymentContext } from "@/services/payments/queries";

export function AllocationFields({
  open,
  plan,
  mode,
  setMode,
  manual,
  setManual,
  dir,
  target,
  name,
}: {
  open: PaymentContext["obligations"];
  plan: { allocations: Allocation[]; excess: number; error: string | null };
  mode: "auto" | "manual";
  setMode: (mode: "auto" | "manual") => void;
  manual: Record<string, string>;
  setManual: (value: Record<string, string>) => void;
  dir: "in" | "out";
  target: Currency;
  name: string;
}) {
  const t = useTranslations("payment");
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{t("allocation")}</span>
        <button
          type="button"
          className="text-[13px] font-semibold"
          onClick={() => setMode(mode === "auto" ? "manual" : "auto")}
        >
          {mode === "auto" ? t("manual") : t("auto")}
        </button>
      </div>
      <ul className="flex flex-col">
        {open.map((o) => {
          const alloc = plan.allocations.find((a) => a.obligationId === o.id)?.amount ?? 0;
          return (
            <li
              key={o.id}
              className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-medium">{o.title}</span>
                <span className="text-xs text-muted-foreground">
                  {money(o.available, o.currency, locale)}
                  {o.groupName ? ` · ${o.groupName}` : ""}
                  {mode === "auto" && alloc > 0
                    ? ` → ${alloc === o.available ? t("willSettle") : t("willRemain", { amount: money(o.available - alloc, o.currency, locale) })}`
                    : ""}
                </span>
              </div>
              {mode === "manual" ? (
                <Input
                  inputMode="numeric"
                  className="h-10 w-32 text-right"
                  value={manual[o.id] ?? ""}
                  onChange={(e) => setManual({ ...manual, [o.id]: e.target.value })}
                  placeholder="0"
                  aria-label={o.title}
                />
              ) : (
                <span className="text-[15px] font-bold num">{alloc > 0 ? money(alloc, o.currency, locale) : "—"}</span>
              )}
            </li>
          );
        })}
      </ul>
      {plan.error ? <p className="text-sm font-medium text-neg">{plan.error}</p> : null}
      {!plan.error && plan.excess > 0 ? (
        <p className="rounded-md bg-soft px-3.5 py-3 text-[13px] leading-snug">
          {t.rich(dir === "in" ? "excessYouOwe" : "excessTheyOwe", {
            amount: money(plan.excess, target, locale),
            name,
            b: (c) => <b className="font-bold">{c}</b>,
          })}
        </p>
      ) : null}
    </div>
  );
}
