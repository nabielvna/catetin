import { type Currency, isCurrency } from "@/domain/money";
import { STAT_PERIODS, type StatPeriod } from "@/domain/stats";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function parsePeriod(v: string | string[] | undefined): StatPeriod {
  return typeof v === "string" && (STAT_PERIODS as string[]).includes(v) ? (v as StatPeriod) : "quarter";
}
export function parseCurrency(v: string | string[] | undefined): Currency | null {
  return typeof v === "string" && isCurrency(v.toUpperCase()) ? (v.toUpperCase() as Currency) : null;
}

export function statsHref(base: string, period: StatPeriod, currency: Currency | null) {
  const p = new URLSearchParams();
  if (period !== "quarter") p.set("period", period);
  if (currency) p.set("currency", currency);
  const q = p.toString();
  return q ? `${base}?${q}` : base;
}

export function PeriodChips({
  base,
  period,
  currency,
  currencies,
  labels,
}: {
  base: string;
  period: StatPeriod;

  currency: Currency | null;
  currencies: Currency[];
  labels: Record<StatPeriod, string>;
}) {
  const chip = (on: boolean) =>
    cn(
      "flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold",
      on ? "border-foreground bg-foreground text-background" : "border-border",
    );
  return (
    <div className="flex flex-col gap-2 pt-1">
      <nav className="-mx-5 flex gap-2 overflow-x-auto px-5" aria-label="period">
        {STAT_PERIODS.map((p) => (
          <Link
            key={p}
            href={statsHref(base, p, currency)}
            replace
            scroll={false}
            aria-current={p === period ? "page" : undefined}
            className={chip(p === period)}
          >
            {labels[p]}
          </Link>
        ))}
      </nav>
      {currencies.length > 1 ? (
        <nav className="-mx-5 flex gap-2 overflow-x-auto px-5" aria-label="currency">
          {currencies.map((c, i) => {
            const on = currency ? c === currency : i === 0;
            return (
              <Link
                key={c}
                href={statsHref(base, period, c)}
                replace
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={chip(on)}
              >
                {c}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

export function Section({
  title,
  aside,
  note,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col px-5 pt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold tracking-[-0.01em]">{title}</h2>
        {aside ? <span className="text-[13px] text-muted-foreground">{aside}</span> : null}
      </div>
      {note ? <span className="pt-1 text-[13px] text-muted-foreground">{note}</span> : null}
      {children}
    </section>
  );
}

export function CompareTable({
  head,
  rows,
}: {
  head: [string, string];
  rows: Array<{ label: string; a: string; b: string; empty?: boolean }>;
}) {
  const shown = rows.filter((r) => !r.empty);
  return (
    <div className="flex flex-col pt-2">
      <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2 border-b border-line pt-2 pb-1.5 text-xs font-semibold text-muted-foreground">
        <span />
        <span className="text-right">{head[0]}</span>
        <span className="text-right">{head[1]}</span>
      </div>
      {shown.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[1.3fr_1fr_1fr] items-baseline gap-2 border-b border-line py-2.5 last:border-0"
        >
          <span className="text-sm text-muted-foreground">{r.label}</span>
          <span className="text-right text-[15px] font-bold num">{r.a}</span>
          <span className="text-right text-[15px] font-bold num">{r.b}</span>
        </div>
      ))}
    </div>
  );
}

export function HeroBalance({
  caption,
  sign,
  symbol,
  number,
  left,
  right,
}: {
  caption: string;
  sign: "+" | "−" | "";
  symbol: string;
  number: string;
  left: { label: string; value: string; sub?: string; raw: number };
  right: { label: string; value: string; sub?: string; raw: number };
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">{caption}</span>
        <div className="flex items-baseline gap-1 leading-none">
          <span className="text-[26px] font-bold tracking-[-0.03em]">
            {sign}
            {symbol}
          </span>
          <span className="text-[54px] font-extrabold num tracking-tighter">{number}</span>
        </div>
      </div>
      {left.raw + right.raw > 0 ? (
        <div className="flex h-1.5 gap-0.75" aria-hidden>
          {left.raw > 0 ? <span className="rounded-full bg-pos" style={{ flexGrow: left.raw }} /> : null}
          {right.raw > 0 ? <span className="rounded-full bg-neg" style={{ flexGrow: right.raw }} /> : null}
        </div>
      ) : null}
      <div className="flex justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{left.label}</span>
          <span className="text-base font-bold num text-pos">{left.value}</span>
          {left.sub ? <span className="text-xs text-muted-foreground">{left.sub}</span> : null}
        </div>
        <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
          <span className="text-xs text-muted-foreground">{right.label}</span>
          <span className="text-base font-bold num text-neg">{right.value}</span>
          {right.sub ? <span className="text-xs text-muted-foreground">{right.sub}</span> : null}
        </div>
      </div>
    </div>
  );
}
