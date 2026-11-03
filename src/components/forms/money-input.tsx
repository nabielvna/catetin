"use client";

import { useLocale } from "next-intl";
import { type ReactNode, useId } from "react";

import { SkeletonText } from "@/components/ui/skeleton";
import { type Currency, currencySymbol, parseAmount } from "@/domain/money";
import { intlLocale, money } from "@/lib/format";
import { cn } from "@/lib/utils";

export function MoneyInput({
  value,
  onChange,
  currency,
  label,
  autoFocus,
  className,
  size = "lg",
  invalidHint,
  skeleton = false,
}: {
  value: string;
  onChange: (raw: string, parsed: number | null) => void;
  currency: Currency;
  label?: ReactNode;
  autoFocus?: boolean;
  className?: string;
  size?: "lg" | "md";
  invalidHint?: string;

  skeleton?: boolean;
}) {
  const id = useId();
  const locale = useLocale();
  const parsed = value.trim() ? parseAmount(value, currency) : null;
  const showHint = value.trim() !== "" && (parsed === null || /[a-z]/i.test(value));
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
          {label}
        </label>
      ) : null}
      <div className="flex items-baseline gap-1.5 border-b-2 border-foreground/80 pb-1 focus-within:border-foreground">
        <span
          className={cn("font-bold tracking-[-0.03em] text-muted-foreground", size === "lg" ? "text-2xl" : "text-lg")}
        >
          {skeleton ? <SkeletonText w="1.3em" /> : currencySymbol(currency, intlLocale(locale))}
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw, raw.trim() ? parseAmount(raw, currency) : null);
          }}
          placeholder="0"
          className={cn(
            "w-full min-w-0 bg-transparent font-extrabold num tracking-[-0.04em] outline-none placeholder:text-muted-foreground/40",
            size === "lg" ? "h-14 text-[40px]" : "h-11 text-2xl",
          )}
          aria-invalid={value.trim() !== "" && parsed === null}
        />
      </div>
      {showHint ? (
        <span className={cn("text-[13px]", parsed === null ? "text-neg" : "text-muted-foreground")}>
          {parsed === null ? (invalidHint ?? "?") : `= ${money(parsed, currency, locale)}`}
        </span>
      ) : null}
    </div>
  );
}
