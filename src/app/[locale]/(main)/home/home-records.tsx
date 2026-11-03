"use client";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { InitialSkeleton } from "@/components/layout/skeletons";
import { OpenRow } from "@/components/records/record-card";
import { RecentRow } from "@/components/records/record-card";
import { SkeletonText } from "@/components/ui/skeleton";
import type { RecordRow } from "@/domain/records";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { RecentEntry } from "@/services/records";
type Tab = "open" | "recent";

export function HomeRecords({ open, recent }: { open: { rows: RecordRow[]; total: number }; recent: RecentEntry[] }) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const tabs: Tab[] = [...(open.rows.length ? ["open" as const] : []), ...(recent.length ? ["recent" as const] : [])];
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "open");
  const panelId = useId();
  if (tabs.length === 0) return null;
  const more = open.total - open.rows.length;

  return (
    <section className="flex flex-col px-5 pt-7" data-tour="home.records">
      <div className="flex items-center justify-between">
        <div role="tablist" className="flex gap-4.5">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`${panelId}-${k}`}
              aria-controls={panelId}
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn(
                "flex h-11 items-baseline gap-1.5 pt-2 text-xl font-extrabold tracking-[-0.03em] transition-colors",
                tab === k ? "text-foreground" : "text-foreground/45",
              )}
            >
              {k === "open" ? t("openTab") : t("recentTab")}
              {k === "open" ? (
                <span className="text-[13px] font-semibold num tracking-normal text-muted-foreground">
                  {open.total}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Link
          href={tab === "open" ? "/debts" : "/debts?status=all&sort=newest"}
          data-tour="home.records.all"
          className="flex h-11 items-center text-[13px] font-medium"
        >
          {tc("seeAll")}
        </Link>
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={`${panelId}-${tab}`}>
        {tab === "open" ? (
          <>
            <ul>
              {open.rows.map((r) => (
                <OpenRow key={r.id} r={r} />
              ))}
            </ul>
            {more > 0 ? (
              <Link href="/debts" className="flex h-11 items-center text-sm font-semibold">
                {t("moreOpen", { count: more })}
              </Link>
            ) : null}
          </>
        ) : (
          <ul>
            {recent.map((e) => (
              <RecentRow key={`${e.kind}:${e.id}`} e={e} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function HomeRecordsSkeleton() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  return (
    <section className="flex flex-col px-5 pt-7" aria-busy>
      <div className="flex items-center justify-between" aria-hidden>
        <div className="flex gap-4.5">
          <span className="flex h-11 items-baseline gap-1.5 pt-2 text-xl font-extrabold tracking-[-0.03em]">
            {t("openTab")}
            <span className="text-[13px] font-semibold num tracking-normal text-muted-foreground">
              <SkeletonText w="1ch" />
            </span>
          </span>
          <span className="flex h-11 items-baseline gap-1.5 pt-2 text-xl font-extrabold tracking-[-0.03em] text-foreground/45">
            {t("recentTab")}
          </span>
        </div>
        <span className="flex h-11 items-center text-[13px] font-medium">{tc("seeAll")}</span>
      </div>
      <ul>
        {(["9ch", "6ch", "11ch", "7ch", "10ch"] as const).map((w, i) => (
          <li key={i} className="border-b border-line last:border-0">
            <div className="flex items-center gap-3.5 py-3">
              <InitialSkeleton className="size-9" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold">
                  <SkeletonText w={w} />
                </span>
                <span className="truncate text-[13px] text-muted-foreground">
                  <SkeletonText w="18ch" />
                </span>
              </div>
              <span className="shrink-0 text-[15px] font-bold num whitespace-nowrap">
                <SkeletonText w="6ch" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
