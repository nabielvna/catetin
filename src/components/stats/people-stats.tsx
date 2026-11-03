"use client";

import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { OptionSheet } from "@/components/forms/option-sheet";
import { Initial } from "@/components/records/record-parts";
import { days } from "@/components/stats/format";
import type { PersonRow } from "@/domain/stats";
import { Link } from "@/i18n/navigation";
import { money } from "@/lib/format";

type Sort = "often" | "total" | "fastest" | "slowest";
const SHOWN = 5;

export function PeopleStats({ people, currency }: { people: PersonRow[]; currency: string }) {
  const t = useTranslations("stats");
  const locale = useLocale();
  const [sort, setSort] = useState<Sort>("often");
  const [sortOpen, setSortOpen] = useState(false);
  const [all, setAll] = useState(false);
  const fmt = (n: number) => days(t as never, n);

  const sorted = [...people].sort((a, b) => {
    if (sort === "total") return b.lent + b.borrowed - (a.lent + a.borrowed);
    if (sort === "fastest" || sort === "slowest") {
      const av = a.theirDays ?? (sort === "fastest" ? Infinity : -Infinity);
      const bv = b.theirDays ?? (sort === "fastest" ? Infinity : -Infinity);
      return sort === "fastest" ? av - bv : bv - av;
    }
    return b.lentCount + b.borrowedCount - (a.lentCount + a.borrowedCount);
  });
  const shown = all ? sorted : sorted.slice(0, SHOWN);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold tracking-[-0.01em]">{t("peopleTitle")}</h2>
        <button
          type="button"
          onClick={() => setSortOpen(true)}
          aria-haspopup="dialog"
          className="flex h-11 items-center gap-1 text-[13px] font-semibold"
        >
          {t(`sort.${sort}`)}
          <ChevronDown className="size-3.5" strokeWidth={2.2} aria-hidden />
        </button>
      </div>
      <ul>
        {shown.map((p) => {
          const sub =
            p.theirDays !== null && p.myDays !== null
              ? t("personSub.both", { their: fmt(p.theirDays), mine: fmt(p.myDays) })
              : p.theirDays !== null
                ? t("personSub.their", { their: fmt(p.theirDays) })
                : p.myDays !== null
                  ? t("personSub.mine", { mine: fmt(p.myDays), name: p.name.split(" ")[0] ?? p.name })
                  : t("personSub.none");
          return (
            <li key={p.id} className="border-b border-line last:border-0">
              <Link href={`/people/${p.id}/stats`} className="flex items-center gap-3.5 py-3">
                <Initial name={p.name} className="size-9 text-sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="truncate text-[13px] text-muted-foreground">{sub}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-[15px] font-bold num">{money(p.lent + p.borrowed, currency, locale)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("debts", { count: p.lentCount + p.borrowedCount })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {!all && people.length > SHOWN ? (
        <button type="button" onClick={() => setAll(true)} className="flex h-11 items-center text-sm font-semibold">
          {t("showAll", { count: people.length })}
        </button>
      ) : null}
      <OptionSheet<Sort>
        open={sortOpen}
        onOpenChange={setSortOpen}
        title={t("sort.title")}
        options={(["often", "total", "fastest", "slowest"] as const).map((s) => ({ value: s, label: t(`sort.${s}`) }))}
        value={sort}
        onSelect={setSort}
      />
    </>
  );
}
