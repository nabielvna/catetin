import { ChevronRight } from "lucide-react";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { EmptyState } from "@/components/records/record-parts";
import { DirectionCategories } from "@/components/stats/direction-categories";
import { age, days, times, within } from "@/components/stats/format";
import { MonthBars } from "@/components/stats/month-bars";
import { CompareTable, HeroBalance, parseCurrency, parsePeriod, PeriodChips, Section } from "@/components/stats/parts";
import { PersonStatsSkeleton } from "@/components/stats/skeletons";
import { todayIn } from "@/domain/dates";
import { DEFAULT_RECORD_FILTER, recordFilterQuery } from "@/domain/records";
import { computePersonStats, STAT_PERIODS, statCurrencies, type StatPeriod } from "@/domain/stats";
import { Link } from "@/i18n/navigation";
import { money, moneyParts } from "@/lib/format";
import { isUuid } from "@/lib/server/ids";
import { requireActorPage } from "@/services/page-access";
import { personCore } from "@/services/people/queries";
import { statsInput } from "@/services/stats";

export default function PersonStatsPage(props: PageProps<"/[locale]/people/[id]/stats">) {
  return (
    <Suspense
      fallback={
        <Suspense fallback={<PersonStatsSkeleton />}>
          <Resolve value={props.searchParams}>
            {(sp) => <PersonStatsSkeleton period={parsePeriod(sp.period)} />}
          </Resolve>
        </Suspense>
      }
    >
      <Resolve value={Promise.all([props.params, props.searchParams])}>
        {([{ id: partyId }, sp]) => <Content partyId={partyId} sp={sp} />}
      </Resolve>
    </Suspense>
  );
}

async function Content({ partyId, sp }: { partyId: string; sp: Record<string, string | string[] | undefined> }) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(partyId)) notFound();
  const actor = await requireActorPage(`/people/${partyId}/stats`);
  const c = await personCore(actor, partyId);
  if (!c) notFound();
  const [all, locale, t, tc, tp, tm] = await Promise.all([
    statsInput(actor),
    getLocale(),
    getTranslations("stats"),
    getTranslations("categories"),
    getTranslations("payment"),
    getTranslations("money"),
  ]);
  const tt = t as never;
  const name = c.name.split(" ")[0] ?? c.name;
  const base = `/people/${partyId}/stats`;
  const header = <PageHeader title={c.name} fallbackHref={`/people/${partyId}`} />;

  const mine = { ...all, obligations: all.obligations.filter((o) => o.counterpartId === partyId) };
  const currencies = statCurrencies(mine, actor.currency);
  if (currencies.length === 0) {
    return (
      <>
        {header}
        <div className="px-5 pt-6">
          <EmptyState body={t("empty")} />
        </div>
      </>
    );
  }
  const period = parsePeriod(sp.period);
  const picked = parseCurrency(sp.currency);
  const currency = picked && currencies.includes(picked) ? picked : currencies[0]!;
  const today = todayIn(actor.timezone, new Date());
  const s = computePersonStats(all, partyId, { period, currency, today });
  const m = (v: number) => money(v, currency, locale);
  const h = s.habits;
  const balance = h.them.openAmount - h.me.openAmount;
  const parts = moneyParts(Math.abs(balance), currency, locale);
  const periodLabels = Object.fromEntries(STAT_PERIODS.map((p) => [p, t(`period.${p}`)])) as Record<StatPeriod, string>;
  const late = h.them.dueCount - h.them.onTime;
  const dash = "–";

  const records = (extra: Partial<typeof DEFAULT_RECORD_FILTER>) =>
    `/debts${recordFilterQuery({ ...DEFAULT_RECORD_FILTER, status: [], sort: "newest", people: [partyId], ...extra })}`;
  const bars = (list: typeof s.categoriesIn, dir: "THEY_OWE" | "I_OWE") =>
    list.map((b) => ({
      key: b.key,
      label: tc(b.key as "OTHER"),
      amount: b.amount,
      count: b.count,
      href: records({ categories: [b.key], dir: [dir] }),
    }));

  return (
    <>
      {header}
      <div className="flex flex-col pb-10">
        <div className="px-5">
          <span className="text-[13px] text-muted-foreground">{t("personTitle")}</span>
          <PeriodChips base={base} period={period} currency={picked} currencies={currencies} labels={periodLabels} />
        </div>

        <div className="px-5 pt-6">
          <HeroBalance
            caption={`${t("balanceNow")} · ${
              balance > 0 ? tm("theyOweYou", { name }) : balance < 0 ? tm("youOweThem", { name }) : tm("allSettled")
            }`}
            sign={balance > 0 ? "+" : balance < 0 ? "−" : ""}
            symbol={parts.symbol}
            number={parts.number}
            left={{
              label: t("theyLent", { name }),
              value: m(s.summary.lent),
              sub: `${t("debts", { count: s.summary.lentCount })} · ${periodLabels[period]}`,
              raw: s.summary.lent,
            }}
            right={{
              label: t("youLent", { name }),
              value: m(s.summary.borrowed),
              sub: `${t("debts", { count: s.summary.borrowedCount })} · ${periodLabels[period]}`,
              raw: s.summary.borrowed,
            }}
          />
        </div>

        {h.them.medianDays !== null ? (
          <p className="px-5 pt-6 text-[15px] leading-relaxed">
            {t.rich("insight", { name, their: days(tt, h.them.medianDays), b: (ch) => <b>{ch}</b> })}
            {h.me.medianDays !== null && h.me.medianDays !== h.them.medianDays
              ? t.rich(h.them.medianDays > h.me.medianDays ? "insightSlower" : "insightFaster", {
                  diff: days(tt, Math.abs(h.them.medianDays - h.me.medianDays)),
                  b: (ch) => <b>{ch}</b>,
                })
              : null}
            .{late > 0 ? ` ${t("insightLate", { late, total: h.them.dueCount })}` : null}
          </p>
        ) : null}

        <Section title={t("compareTitle")}>
          <CompareTable
            head={[t("colPersonThem", { name }), t("colPersonMe", { name })]}
            rows={[
              { label: t("rows.count"), a: String(s.summary.lentCount), b: String(s.summary.borrowedCount) },
              { label: t("rows.total"), a: m(s.summary.lent), b: m(s.summary.borrowed) },
              {
                label: t("rows.avg"),
                a: s.avgIn !== null ? m(s.avgIn) : dash,
                b: s.avgOut !== null ? m(s.avgOut) : dash,
                empty: s.avgIn === null && s.avgOut === null,
              },
              {
                label: t("rows.typical"),
                a: days(tt, h.them.medianDays),
                b: days(tt, h.me.medianDays),
                empty: h.them.medianDays === null && h.me.medianDays === null,
              },
              {
                label: t("rows.fastest"),
                a: days(tt, h.them.fastestDays),
                b: days(tt, h.me.fastestDays),
                empty: h.them.fastestDays === null && h.me.fastestDays === null,
              },
              {
                label: t("rows.slowest"),
                a: days(tt, h.them.slowestDays),
                b: days(tt, h.me.slowestDays),
                empty: h.them.slowestDays === null && h.me.slowestDays === null,
              },
              {
                label: t("rows.onTime"),
                a: h.them.dueCount ? t("ofTotal", { done: h.them.onTime, total: h.them.dueCount }) : dash,
                b: h.me.dueCount ? t("ofTotal", { done: h.me.onTime, total: h.me.dueCount }) : dash,
                empty: !h.them.dueCount && !h.me.dueCount,
              },
              {
                label: t("rows.late"),
                a: days(tt, h.them.avgLateDays),
                b: days(tt, h.me.avgLateDays),
                empty: h.them.avgLateDays === null && h.me.avgLateDays === null,
              },
              {
                label: t("rows.reminders"),
                a: times(tt, h.them.remindersAvg, locale),
                b: times(tt, h.me.remindersAvg, locale),
                empty: !h.them.remindersAvg && !h.me.remindersAvg,
              },
              {
                label: t("rows.confirm"),
                a: within(tt, h.them.confirmMinutes),
                b: within(tt, h.me.confirmMinutes),
                empty: h.them.confirmMinutes === null && h.me.confirmMinutes === null,
              },
              {
                label: t("rows.installments"),
                a: h.them.installments ? t("debts", { count: h.them.installments }) : dash,
                b: h.me.installments ? t("debts", { count: h.me.installments }) : dash,
                empty: !h.them.installments && !h.me.installments,
              },
              {
                label: t("rows.method"),
                a: h.them.favoriteMethod ? tp(`methods.${h.them.favoriteMethod.method as "CASH"}`) : dash,
                b: h.me.favoriteMethod ? tp(`methods.${h.me.favoriteMethod.method as "CASH"}`) : dash,
                empty: !h.them.favoriteMethod && !h.me.favoriteMethod,
              },
              {
                label: t("rows.open"),
                a: h.them.openCount ? t("debts", { count: h.them.openCount }) : "–",
                b: h.me.openCount ? t("debts", { count: h.me.openCount }) : "–",
                empty: !h.them.openCount && !h.me.openCount,
              },
              {
                label: t("rows.openAmount"),
                a: h.them.openCount ? m(h.them.openAmount) : "–",
                b: h.me.openCount ? m(h.me.openAmount) : "–",
                empty: !h.them.openCount && !h.me.openCount,
              },
              {
                label: t("rows.oldestOpen"),
                a: h.them.oldestOpenDays !== null ? age(tt, h.them.oldestOpenDays) : dash,
                b: h.me.oldestOpenDays !== null ? age(tt, h.me.oldestOpenDays) : dash,
                empty: h.them.oldestOpenDays === null && h.me.oldestOpenDays === null,
              },
            ]}
          />
        </Section>

        {s.months.some((x) => x.lent || x.borrowed) ? (
          <Section title={t("monthsTitle")} aside={t("monthsAside")}>
            <MonthBars
              months={s.months}
              currency={currency}
              legendUp={t("legendTheyBorrowed")}
              legendDown={t("legendYouBorrowed")}
              valuesKey="personMonthValues"
            />
          </Section>
        ) : null}

        {s.categoriesIn.length + s.categoriesOut.length > 0 ? (
          <Section title={t("forWhat")}>
            <DirectionCategories
              theirs={bars(s.categoriesIn, "THEY_OWE")}
              mine={bars(s.categoriesOut, "I_OWE")}
              labels={{ theirs: t("theyBorrowFor", { name }), mine: t("youBorrowFor"), aria: t("forWhat") }}
              currency={currency}
            />
          </Section>
        ) : null}

        <div className="flex flex-col px-5 pt-6">
          <Link
            href={records({})}
            className="flex h-13 items-center justify-between border-b border-line text-[15px] font-semibold"
          >
            {t("allWith", { name })}
            <ChevronRight className="size-4.5" aria-hidden />
          </Link>
          <Link
            href={`/people/${partyId}`}
            className="flex h-13 items-center justify-between text-[15px] font-semibold"
          >
            {t("openPerson", { name })}
            <ChevronRight className="size-4.5" aria-hidden />
          </Link>
        </div>
        <p className="px-5 pt-4 text-center text-xs text-muted-foreground">{t("onlyYours", { currency })}</p>
      </div>
    </>
  );
}
