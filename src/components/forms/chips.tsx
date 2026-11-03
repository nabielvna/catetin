"use client";

import { cn } from "@/lib/utils";

export function Chips<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string; tour?: string }>;
  value: T | null;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-tour={o.tour}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-md border px-3 text-[13px] font-semibold transition-colors",
            value === o.value ? "border-foreground bg-foreground text-background" : "border-border hover:bg-soft",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Array<{ value: T; label: string; tour?: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-md bg-soft p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          data-tour={o.tour}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 truncate rounded-sm px-2 text-sm font-semibold transition-colors",
            value === o.value ? "bg-background shadow-sm" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
