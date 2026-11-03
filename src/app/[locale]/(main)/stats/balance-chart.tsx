import { getTranslations } from "next-intl/server";

import { BalanceLine } from "@/components/stats/balance-line";
import { Section } from "@/components/stats/parts";
import type { Currency } from "@/domain/money";
import type { BalancePoint } from "@/domain/stats";
import { money } from "@/lib/format";
export async function BalanceChart({
  points,
  currency,
  locale,
}: {
  points: BalancePoint[];
  currency: Currency;
  locale: string;
}) {
  const t = await getTranslations("stats");
  const m = (value: number, sign: "auto" | "always" = "auto") => money(value, currency, locale, sign);
  return (
    <>
      {points.some((p) => p.balance !== 0) ? (
        <Section
          title={t("balanceTitle")}
          aside={t("balanceAside")}
          note={t("balanceChange", {
            from: m(points[0]!.balance, "always"),
            month: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
              new Date(`${points[0]!.month}-01T00:00:00Z`),
            ),
            to: m(points.at(-1)!.balance, "always"),
          })}
        >
          <BalanceLine points={points} currency={currency} locale={locale} />
        </Section>
      ) : null}
    </>
  );
}
