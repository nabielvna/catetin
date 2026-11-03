import type { BalancePoint } from "@/domain/stats";
import { money } from "@/lib/format";

const W = 350;
const H = 120;

export function BalanceLine({
  points,
  currency,
  locale,
}: {
  points: BalancePoint[];
  currency: string;
  locale: string;
}) {
  const values = points.map((p) => p.balance);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => 6 + (i * (W - 12)) / Math.max(1, points.length - 1);
  const y = (v: number) => 8 + ((max - v) / span) * (H - 16);
  const monthName = (m: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
  const last = points.length - 1;

  return (
    <div className="flex flex-col">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-30 w-full overflow-visible"
        role="img"
        aria-label={points
          .map((p) => `${monthName(p.month)} ${money(p.balance, currency, locale, "always")}`)
          .join(", ")}
      >
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="stroke-border" strokeWidth="1" />
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.balance)}`).join(" ")}
          fill="none"
          className="stroke-foreground"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <circle
            key={p.month}
            cx={x(i)}
            cy={y(p.balance)}
            r={i === last ? 4 : 3}
            className={i === last ? "fill-foreground stroke-background" : "fill-background stroke-foreground"}
            strokeWidth="2"
          >
            <title>{`${monthName(p.month)}: ${money(p.balance, currency, locale, "always")}`}</title>
          </circle>
        ))}
      </svg>
      <div
        className="grid pt-1.5 text-[11px] font-semibold text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((p, i) => (
          <span
            key={p.month}
            className={
              i === last ? "text-right text-foreground capitalize" : i === 0 ? "capitalize" : "text-center capitalize"
            }
          >
            {monthName(p.month)}
          </span>
        ))}
      </div>
    </div>
  );
}
