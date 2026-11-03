"use client";

import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { InitialSkeleton } from "@/components/layout/skeletons";
import { Amount, EmptyState, Initial } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonText } from "@/components/ui/skeleton";
import type { Currency } from "@/domain/money";
import { Link } from "@/i18n/navigation";
import { matchesName } from "@/lib/search";
import type { PersonListItem } from "@/services/people/queries";

export function PeopleList({
  people,
  primaryCurrency,
  archivedCount = 0,
}: {
  people: PersonListItem[];
  primaryCurrency: Currency;
  archivedCount?: number;
}) {
  const t = useTranslations("people");
  const tp = useTranslations("person");
  const tm = useTranslations("money");
  const locale = useLocale();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => people.filter((p) => matchesName(p.name, q)), [people, q]);
  const open = filtered.filter((p) => Object.keys(p.net).length > 0 || p.pendingCount > 0);
  const settled = filtered.filter((p) => Object.keys(p.net).length === 0 && p.pendingCount === 0);

  const archivedLink =
    archivedCount > 0 ? (
      <Link href="/people/archived" className="self-start py-5 text-[13px] font-semibold text-muted-foreground">
        {tp("archive.list")} ({archivedCount})
      </Link>
    ) : null;

  if (people.length === 0) {
    return (
      <div className="flex flex-col px-5">
        <EmptyState body={t("empty")}>
          <Button asChild>
            <Link href="/people/new" data-tour="people.add">
              {t("add")}
            </Link>
          </Button>
        </EmptyState>
        {archivedLink}
      </div>
    );
  }

  const row = (p: PersonListItem) => {
    const entries = Object.entries(p.net) as Array<[Currency, number]>;
    const main = entries.find(([c]) => c === primaryCurrency) ?? entries[0];
    const sub =
      p.pendingCount > 0
        ? t("pending", { count: p.pendingCount })
        : p.state === "MANUAL"
          ? t("manual")
          : p.state === "DELETED"
            ? ""
            : entries.length === 0
              ? tm("allSettled")
              : main && main[1] > 0
                ? tm("theyOweYou", { name: p.name.split(" ")[0] ?? p.name })
                : tm("youOweThem", { name: p.name.split(" ")[0] ?? p.name });
    return (
      <li key={p.pairId} className="border-b border-line last:border-0">
        <Link href={`/people/${p.partyId}`} className="flex items-center gap-3 py-3">
          <Initial name={p.name} className={p.state === "USER" ? "" : "bg-soft text-foreground"} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-semibold">{p.name}</span>
            <span className="truncate text-[13px] text-muted-foreground">{sub}</span>
          </div>
          <div className="flex flex-col items-end">
            {main ? <Amount value={main[1]} currency={main[0]} locale={locale} className="text-[15px]" /> : null}
            {entries.length > 1 ? <span className="text-xs text-muted-foreground">+{entries.length - 1}</span> : null}
          </div>
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col px-5">
      <div className="relative mt-1 mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 border-transparent bg-soft pl-9"
          aria-label={t("searchPlaceholder")}
        />
      </div>
      {filtered.length === 0 ? <p className="py-6 text-sm text-muted-foreground">{t("noResult", { q })}</p> : null}
      <ul>{open.map(row)}</ul>
      {settled.length > 0 ? (
        <>
          <h2 className="pt-6 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {t("settledSection")}
          </h2>
          <ul>{settled.map(row)}</ul>
        </>
      ) : null}
      {archivedLink}
    </div>
  );
}

export function PeopleListSkeleton() {
  const t = useTranslations("people");
  return (
    <div className="flex flex-col px-5" aria-busy>
      <div className="relative mt-1 mb-2">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t("searchPlaceholder")}
          className="h-11 border-transparent bg-soft pl-9"
          readOnly
          tabIndex={-1}
          aria-hidden
        />
      </div>
      <ul>
        {["10ch", "7ch", "12ch", "8ch", "11ch", "9ch"].map((w) => (
          <li key={w} className="border-b border-line last:border-0">
            <div className="flex items-center gap-3 py-3">
              <InitialSkeleton />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold">
                  <SkeletonText w={w} />
                </span>
                <span className="truncate text-[13px] text-muted-foreground">
                  <SkeletonText w="14ch" />
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[15px] font-bold num whitespace-nowrap">
                  <SkeletonText w="6ch" />
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
