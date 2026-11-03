import type { Currency } from "@/domain/money";
import { dateBlock, money } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Amount({
  value,
  currency,
  locale,
  sign = "always",
  tone,
  className,
}: {
  value: number;
  currency: Currency | string;
  locale: string;
  sign?: "always" | "auto" | "never";
  tone?: "pos" | "neg" | "muted" | "plain";
  className?: string;
}) {
  const t = tone ?? (value > 0 ? "pos" : value < 0 ? "neg" : "plain");
  return (
    <span
      className={cn(
        "font-bold num whitespace-nowrap",
        t === "pos" && "text-pos",
        t === "neg" && "text-neg",
        t === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {money(value, currency, locale, sign)}
    </span>
  );
}

export function DateBlock({ date, locale }: { date: string; locale: string }) {
  const { day, month } = dateBlock(date, locale);
  return (
    <div className="flex w-8.5 shrink-0 flex-col items-center" aria-hidden>
      <span className="text-lg leading-[1.1] font-bold num">{day}</span>
      <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">{month}</span>
    </div>
  );
}

export function SectionTitle({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between pb-1.5">
      <h2 className="text-base font-bold tracking-[-0.01em]">{title}</h2>
      {aside ? <span className="text-[13px] text-muted-foreground">{aside}</span> : null}
    </div>
  );
}

export function Initial({ name, className }: { name: string; className?: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-[15px] font-bold text-background",
        className,
      )}
    >
      {letter}
    </span>
  );
}

export function EmptyState({ title, body, children }: { title?: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-8">
      {title ? <h3 className="text-lg font-bold">{title}</h3> : null}
      <p className="text-[15px] text-pretty text-muted-foreground">{body}</p>
      {children}
    </div>
  );
}

export function Cover({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(40rem,85dvh)] bg-waves-fade"
      />
      {children}
    </div>
  );
}
