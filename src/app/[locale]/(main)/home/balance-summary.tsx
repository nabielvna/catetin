import { ChartColumn, ChevronRight } from "lucide-react";
import { cacheLife } from "next/cache";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { AssistantBar } from "@/components/assistant/assistant-bar";
import { BigAmountSkeleton } from "@/components/layout/skeletons";
import { Amount, EmptyState } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import type { BalanceSummary } from "@/domain/balance";
import { type Currency, nonZeroEntries } from "@/domain/money";
import { Link } from "@/i18n/navigation";
import { money, moneyParts } from "@/lib/format";
import type { Actor } from "@/services/context";
import { balanceSummary, hasAnything } from "@/services/home";
import { requireActorPage } from "@/services/page-access";
export async function summaryOf(actor: Actor) {
  "use cache: private";
  cacheLife("session");
  return balanceSummary(actor);
}

export async function anyOf(actor: Actor) {
  "use cache: private";
  cacheLife("session");
  return hasAnything(actor);
}

export function primaryView(actor: Actor, summary: BalanceSummary) {
  const net = nonZeroEntries(summary.net);
  const primary: Currency =
    summary.net[actor.currency] !== undefined || net.length === 0
      ? actor.currency
      : net.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]![0];
  return {
    primary,
    primaryNet: summary.net[primary] ?? 0,
    others: net.filter(([c]) => c !== primary),
    owed: summary.owedToMe[primary] ?? 0,
    owe: summary.iOwe[primary] ?? 0,
  };
}

export async function Balance() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/home");
  const [summary, any] = await Promise.all([summaryOf(actor), anyOf(actor)]);
  const locale = await getLocale();
  const t = await getTranslations("home");
  const ts = await getTranslations("stats");

  if (!any) {
    return (
      <div className="flex flex-col gap-6 px-5 pt-6">
        <AssistantBar />
        <EmptyState title={t("empty.title")} body={t("empty.body")}>
          <div className="mt-2 flex w-full gap-2">
            <Button asChild className="flex-1">
              <Link href="/debts/new">{t("empty.addDebt")}</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/people/new">{t("empty.addPerson")}</Link>
            </Button>
          </div>
        </EmptyState>
      </div>
    );
  }

  const { primary, primaryNet, others, owed, owe } = primaryView(actor, summary);
  const parts = moneyParts(primaryNet, primary, locale);

  return (
    <section className="flex flex-col gap-3.5 px-5 pt-6">
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">{t("netBalance")}</span>
        <div
          className="flex items-baseline gap-1 leading-none"
          aria-label={money(primaryNet, primary, locale, "always")}
        >
          <span className="text-[26px] font-bold tracking-[-0.03em]">
            {primaryNet > 0 ? "+" : primaryNet < 0 ? "−" : ""}
            {parts.symbol}
          </span>
          <span className="text-[54px] font-extrabold num tracking-tighter">{parts.number}</span>
        </div>
        {others.length > 0 ? (
          <span className="text-[13px] text-muted-foreground">
            {t("andOther", { amount: others.map(([c, v]) => money(v, c, locale, "always")).join(", ") })}
          </span>
        ) : null}
      </div>
      {owed + owe > 0 ? (
        <div className="flex h-1.5 gap-0.75" aria-hidden>
          {owed > 0 ? <span className="rounded-full bg-pos" style={{ flexGrow: owed }} /> : null}
          {owe > 0 ? <span className="rounded-full bg-neg" style={{ flexGrow: owe }} /> : null}
        </div>
      ) : null}
      <div className="flex justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{t("owedToYou")}</span>
          <Amount value={owed} currency={primary} locale={locale} sign="never" tone="pos" className="text-base" />
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted-foreground">{t("youOwe")}</span>
          <Amount value={owe} currency={primary} locale={locale} sign="never" tone="neg" className="text-base" />
        </div>
      </div>
      <Link
        href="/stats"
        data-tour="home.stats"
        className="-mb-1 flex h-11 items-center justify-between border-t border-line text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <ChartColumn className="size-4.5" strokeWidth={1.8} aria-hidden />
          {ts("link")}
        </span>
        <ChevronRight className="size-4.5" aria-hidden />
      </Link>
      <AssistantBar className="mt-2" />
    </section>
  );
}

export function BalanceSkeleton() {
  const t = useTranslations("home");
  const ts = useTranslations("stats");
  return (
    <section className="flex flex-col gap-3.5 px-5 pt-6" aria-busy>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">{t("netBalance")}</span>
        <BigAmountSkeleton />
      </div>
      <Skeleton className="h-1.5 rounded-full" />
      <div className="flex justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">{t("owedToYou")}</span>
          <span className="text-base font-bold num">
            <SkeletonText w="7ch" />
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-xs text-muted-foreground">{t("youOwe")}</span>
          <span className="text-base font-bold num">
            <SkeletonText w="7ch" />
          </span>
        </div>
      </div>
      <div className="-mb-1 flex h-11 items-center justify-between border-t border-line text-sm font-semibold">
        <span className="flex items-center gap-2">
          <ChartColumn className="size-4.5" strokeWidth={1.8} aria-hidden />
          {ts("link")}
        </span>
        <ChevronRight className="size-4.5" aria-hidden />
      </div>
      <AssistantBar className="mt-2" />
    </section>
  );
}
