"use client";

import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/layout/page-header";
import { BigAmountSkeleton, BLANK, WithBlank } from "@/components/layout/skeletons";
import { Section } from "@/components/stats/parts";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { STAT_PERIODS, type StatPeriod } from "@/domain/stats";
import { cn } from "@/lib/utils";

function PeriodChipsSkeleton({ period }: { period: StatPeriod }) {
  const t = useTranslations("stats");
  return (
    <div className="flex flex-col gap-2 pt-1" aria-hidden>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {STAT_PERIODS.map((p) => (
          <span
            key={p}
            className={cn(
              "flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold",
              p === period ? "border-foreground bg-foreground text-background" : "border-border",
            )}
          >
            {t(`period.${p}`)}
          </span>
        ))}
      </div>
    </div>
  );
}

function HeroBalanceSkeleton({
  caption,
  left,
  right,
}: {
  caption: React.ReactNode;
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">{caption}</span>
        <BigAmountSkeleton />
      </div>
      <Skeleton className="h-1.5 rounded-full" />
      <div className="flex justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{left}</span>
          <span className="text-base font-bold num">
            <SkeletonText w="7ch" />
          </span>
          <span className="text-xs text-muted-foreground">
            <SkeletonText w="6ch" />
          </span>
        </div>
        <div className="flex min-w-0 flex-col items-end gap-0.5 text-right">
          <span className="text-xs text-muted-foreground">{right}</span>
          <span className="text-base font-bold num">
            <SkeletonText w="7ch" />
          </span>
          <span className="text-xs text-muted-foreground">
            <SkeletonText w="6ch" />
          </span>
        </div>
      </div>
    </div>
  );
}

function MonthBarsSkeleton({ legendUp, legendDown }: { legendUp: string; legendDown: string }) {
  return (
    <div className="flex flex-col">
      <div className="flex gap-3.5 pt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-pos" aria-hidden />
          {legendUp}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-neg" aria-hidden />
          {legendDown}
        </span>
      </div>
      <div className="flex min-h-10 flex-col gap-0.5 pt-3">
        <span className="text-sm font-bold">
          <SkeletonText w="9ch" />
        </span>
        <span className="text-[13px] num text-muted-foreground">
          <SkeletonText w="30ch" />
        </span>
      </div>
      <div className="relative mt-2 grid h-47.5 grid-cols-6 gap-2">
        <span className="absolute inset-x-0 top-30 h-px bg-border" aria-hidden />
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="relative h-full">
            <span className="absolute inset-x-0 bottom-0 text-center text-[11px] font-semibold">
              <SkeletonText w="3ch" />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BalanceLineSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="mt-3 h-30 w-full" />
      <div className="grid grid-cols-6 pt-1.5 text-[11px] font-semibold">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={i === 5 ? "text-right" : i === 0 ? "" : "text-center"}>
            <SkeletonText w="3ch" />
          </span>
        ))}
      </div>
    </div>
  );
}

function CompareTableSkeleton({ head, rows }: { head: [React.ReactNode, React.ReactNode]; rows: string[] }) {
  return (
    <div className="flex flex-col pt-2">
      <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-2 border-b border-line pt-2 pb-1.5 text-xs font-semibold text-muted-foreground">
        <span />
        <span className="text-right">{head[0]}</span>
        <span className="text-right">{head[1]}</span>
      </div>
      {rows.map((label) => (
        <div
          key={label}
          className="grid grid-cols-[1.3fr_1fr_1fr] items-baseline gap-2 border-b border-line py-2.5 last:border-0"
        >
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-right text-[15px] font-bold num">
            <SkeletonText w="6ch" />
          </span>
          <span className="text-right text-[15px] font-bold num">
            <SkeletonText w="6ch" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ period = "quarter" }: { period?: StatPeriod }) {
  const t = useTranslations("stats");
  return (
    <div className="flex flex-col pb-10" aria-busy>
      <div className="px-5">
        <PeriodChipsSkeleton period={period} />
      </div>
      <div className="px-5 pt-6">
        <HeroBalanceSkeleton
          caption={<WithBlank text={t("net", { range: BLANK })} w="16ch" />}
          left={t("lent")}
          right={t("borrowed")}
        />
        <div className="mt-3.5 flex justify-between border-t border-line pt-3 text-[13px] text-muted-foreground">
          <span>
            {t("received")}{" "}
            <b className="font-bold num text-foreground">
              <SkeletonText w="7ch" />
            </b>
          </span>
          <span>
            {t("paid")}{" "}
            <b className="font-bold num text-foreground">
              <SkeletonText w="7ch" />
            </b>
          </span>
        </div>
      </div>
      <Section title={t("balanceTitle")} aside={t("balanceAside")} note={<SkeletonText w="30ch" />}>
        <BalanceLineSkeleton />
      </Section>
      <Section title={t("monthsTitle")} aside={t("monthsAside")}>
        <MonthBarsSkeleton legendUp={t("legendLent")} legendDown={t("legendBorrowed")} />
      </Section>
    </div>
  );
}

export function PersonStatsSkeleton({ period = "quarter" }: { period?: StatPeriod }) {
  const t = useTranslations("stats");
  return (
    <>
      <PageHeader title={<SkeletonText w="6em" />} fallbackHref="/people" />
      <div className="flex flex-col pb-10" aria-busy>
        <div className="px-5">
          <span className="text-[13px] text-muted-foreground">{t("personTitle")}</span>
          <PeriodChipsSkeleton period={period} />
        </div>
        <div className="px-5 pt-6">
          <HeroBalanceSkeleton
            caption={
              <>
                {t("balanceNow")} · <SkeletonText w="14ch" />
              </>
            }
            left={<WithBlank text={t("theyLent", { name: BLANK })} w="4ch" />}
            right={<WithBlank text={t("youLent", { name: BLANK })} w="4ch" />}
          />
        </div>
        <p className="px-5 pt-6 text-[15px] leading-relaxed">
          <SkeletonText w="34ch" />
          <br />
          <SkeletonText w="20ch" />
        </p>
        <Section title={t("compareTitle")}>
          <CompareTableSkeleton
            head={[
              <WithBlank key="them" text={t("colPersonThem", { name: BLANK })} w="4ch" />,
              <WithBlank key="me" text={t("colPersonMe", { name: BLANK })} w="4ch" />,
            ]}
            rows={[t("rows.count"), t("rows.total"), t("rows.avg")]}
          />
        </Section>
      </div>
    </>
  );
}
