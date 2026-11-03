import { cacheLife } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { BalanceChart } from "@/app/[locale]/(main)/stats/balance-chart";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { EmptyState } from "@/components/records/record-parts";
import { age, days, times, within } from "@/components/stats/format";
import { MonthBars } from "@/components/stats/month-bars";
import { CompareTable, HeroBalance, parseCurrency, parsePeriod, PeriodChips, Section } from "@/components/stats/parts";
import { PeopleStats } from "@/components/stats/people-stats";
import { StatsSkeleton } from "@/components/stats/skeletons";
import { WhatFor, type WhatForBucket } from "@/components/stats/what-for";
import { todayIn } from "@/domain/dates";
import { DEFAULT_RECORD_FILTER, recordFilterQuery } from "@/domain/records";
import { computeStats, type GroupBucket, STAT_PERIODS, statCurrencies, type StatPeriod } from "@/domain/stats";
import { Link } from "@/i18n/navigation";
import { formatDate, money, moneyParts } from "@/lib/format";
import { requireActorPage } from "@/services/page-access";
import { statsInput } from "@/services/stats";

export default async function StatsPage(props: PageProps<"/[locale]/stats">) {
  const t = await getTranslations("stats");
  return (
    <>
      <PageHeader title={t("title")} />
      <Suspense
        fallback={
          <Suspense fallback={<StatsSkeleton />}>
            <Resolve value={props.searchParams}>{(sp) => <StatsSkeleton period={parsePeriod(sp.period)} />}</Resolve>
          </Suspense>
        }
      >
        <Resolve value={props.searchParams}>{(sp) => <Content sp={sp} />}</Resolve>
      </Suspense>
    </>
  );
}

async function Content({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/stats");
  const [input, locale, t, tc, tp] = await Promise.all([
    statsInput(actor),
    getLocale(),
    getTranslations("stats"),
    getTranslations("categories"),
    getTranslations("payment"),
  ]);
  const tt = t as never;
  const today = todayIn(actor.timezone, new Date());
  const period = parsePeriod(sp.period);
  const currencies = statCurrencies(input, actor.currency);
  const picked = parseCurrency(sp.currency);
  const currency = picked && currencies.includes(picked) ? picked : (currencies[0] ?? actor.currency);
  const periodLabels = Object.fromEntries(STAT_PERIODS.map((p) => [p, t(`period.${p}`)])) as Record<StatPeriod, string>;

  if (currencies.length === 0) {
    return (
      <div className="px-5 pt-6">
        <EmptyState body={t("empty")} />
      </div>
    );
  }

  const s = computeStats(input, { period, currency, today });
  const m = (v: number, sign?: "always") => money(v, currency, locale, sign);
  const net = s.summary.lent - s.summary.borrowed;
  const parts = moneyParts(Math.abs(net), currency, locale);
  const range = s.from
    ? `${formatDate(s.from, locale, { day: "numeric", month: "short" })} – ${formatDate(today, locale, { day: "numeric", month: "short", year: "numeric" })}`
    : t("since", {
        date: formatDate(input.obligations.map((o) => o.occurredOn).sort()[0] ?? today, locale, {
          month: "long",
          year: "numeric",
        }),
      });
  const any = s.summary.lentCount + s.summary.borrowedCount > 0;

  const recordsHref = (key: "categories" | "labels", value: string) =>
    `/debts${recordFilterQuery({ ...DEFAULT_RECORD_FILTER, status: [], sort: "newest", [key]: [value], currencies: [currency] })}`;
  const toBucket = (b: GroupBucket, kind: "categories" | "labels"): WhatForBucket => ({
    key: b.key,
    label: kind === "categories" ? tc(b.key as "OTHER") : `#${b.key}`,
    amount: b.amount,
    count: b.count,
    top: b.top ? t("mostOften", { name: b.top.name }) : null,
    in: b.in,
    out: b.out,
    href: recordsHref(kind, b.key),
  });

  const h = s.habits;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");
  const agingMax = Math.max(1, ...s.aging.map((a) => a.amount));
  const weekday =
    s.facts.busiestWeekday !== null
      ? new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(
          new Date(Date.UTC(2026, 0, 4 + s.facts.busiestWeekday)),
        )
      : null;
  const facts = [
    s.facts.avgAmount !== null ? { label: t("facts.avg"), value: m(s.facts.avgAmount) } : null,
    s.facts.biggest
      ? {
          label: t("facts.biggest"),
          value: `${m(s.facts.biggest.amount)} · ${s.facts.biggest.title}`,
          href: `/debts/${s.facts.biggest.id}`,
        }
      : null,
    s.facts.topMethod
      ? {
          label: t("facts.method"),
          value: `${tp(`methods.${s.facts.topMethod.method as "CASH"}`)} · ${s.facts.topMethod.share}%`,
        }
      : null,
    s.facts.bills
      ? {
          label: t("facts.bills"),
          value: t("facts.billsValue", { count: s.facts.bills.count, avg: m(s.facts.bills.avgShare) }),
        }
      : null,
    s.facts.forgiven.count
      ? {
          label: t("facts.forgiven"),
          value: t("facts.times", { amount: m(s.facts.forgiven.amount), count: s.facts.forgiven.count }),
        }
      : null,
    s.facts.offsets.count
      ? {
          label: t("facts.offsets"),
          value: t("facts.times", { amount: m(s.facts.offsets.amount), count: s.facts.offsets.count }),
        }
      : null,
    weekday ? { label: t("facts.weekday"), value: weekday } : null,
  ].filter((f): f is { label: string; value: string; href?: string } => f !== null);

  return (
    <div className="flex flex-col pb-10">
      <div className="px-5">
        <PeriodChips base="/stats" period={period} currency={picked} currencies={currencies} labels={periodLabels} />
      </div>

      <div className="px-5 pt-6">
        <HeroBalance
          caption={t("net", { range })}
          sign={net > 0 ? "+" : net < 0 ? "−" : ""}
          symbol={parts.symbol}
          number={parts.number}
          left={{
            label: t("lent"),
            value: m(s.summary.lent),
            sub: t("debts", { count: s.summary.lentCount }),
            raw: s.summary.lent,
          }}
          right={{
            label: t("borrowed"),
            value: m(s.summary.borrowed),
            sub: t("debts", { count: s.summary.borrowedCount }),
            raw: s.summary.borrowed,
          }}
        />
        <div className="mt-3.5 flex justify-between border-t border-line pt-3 text-[13px] text-muted-foreground">
          <span>
            {t("received")} <b className="font-bold num text-foreground">{m(s.summary.received)}</b>
          </span>
          <span>
            {t("paid")} <b className="font-bold num text-foreground">{m(s.summary.paid)}</b>
          </span>
        </div>
      </div>

      <BalanceChart points={s.balance} currency={currency} locale={locale} />

      {s.months.some((x) => x.lent || x.borrowed) ? (
        <Section title={t("monthsTitle")} aside={t("monthsAside")}>
          <MonthBars
            months={s.months}
            currency={currency}
            legendUp={t("legendLent")}
            legendDown={t("legendBorrowed")}
          />
        </Section>
      ) : null}

      {!any ? <p className="px-5 pt-8 text-sm text-muted-foreground">{t("empty")}</p> : null}

      {s.categories.length ? (
        <Section title={t("forWhat")}>
          <WhatFor
            categories={s.categories.map((b) => toBucket(b, "categories"))}
            labels={s.labels.map((b) => toBucket(b, "labels"))}
            currency={currency}
          />
        </Section>
      ) : null}

      {s.people.length ? (
        <section className="flex flex-col px-5 pt-6">
          <PeopleStats people={s.people} currency={currency} />
        </section>
      ) : null}

      {h.them.settledCount + h.me.settledCount + h.them.openCount + h.me.openCount > 0 ? (
        <Section title={t("habitsTitle")} note={t("habitsNote", { count: h.them.settledCount + h.me.settledCount })}>
          <CompareTable
            head={[t("colThem"), t("colMe")]}
            rows={[
              {
                label: t("rows.typical"),
                a: days(tt, h.them.medianDays),
                b: days(tt, h.me.medianDays),
                empty: h.them.medianDays === null && h.me.medianDays === null,
              },
              {
                label: t("rows.onTime"),
                a: pct(h.them.onTime, h.them.dueCount),
                b: pct(h.me.onTime, h.me.dueCount),
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
                label: t("rows.slowest"),
                a: days(tt, h.them.slowestDays),
                b: days(tt, h.me.slowestDays),
                empty: h.them.slowestDays === null && h.me.slowestDays === null,
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
            ]}
          />
        </Section>
      ) : null}

      {s.aging.some((a) => a.count) ? (
        <Section title={t("agingTitle")} note={t("agingNote")}>
          <ul className="pt-2">
            {s.aging.map((a) => (
              <li key={a.bucket} className="grid grid-cols-[92px_1fr_auto] items-center gap-2.5 py-2">
                <span className="text-sm text-muted-foreground">{t(`aging.${a.bucket}`)}</span>
                <span className="h-2 rounded-full bg-soft">
                  {a.amount ? (
                    <span
                      className="block h-2 rounded-full bg-foreground"
                      style={{ width: `${Math.max(2, Math.round((a.amount / agingMax) * 100))}%` }}
                    />
                  ) : null}
                </span>
                <span className="min-w-24 text-right text-sm font-bold num">
                  {a.count ? `${m(a.amount)} · ${a.count}` : "–"}
                </span>
              </li>
            ))}
          </ul>
          {s.oldestOpen ? (
            <Link
              href={`/debts/${s.oldestOpen.id}`}
              className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-line py-3"
            >
              <span className="shrink-0 text-sm text-muted-foreground">{t("oldest")}</span>
              <span className="truncate text-right text-sm font-bold">
                {s.oldestOpen.title} · {s.oldestOpen.name} · {age(tt, s.oldestOpen.days)}
              </span>
            </Link>
          ) : null}
        </Section>
      ) : null}

      {s.groups.length ? (
        <Section title={t("groupsTitle")}>
          <ul>
            {s.groups.map((g) => (
              <li key={g.id} className="border-b border-line last:border-0">
                <Link href={`/groups/${g.id}`} className="flex items-center gap-3.5 py-3">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[15px] font-semibold">{g.name}</span>
                    <span className="truncate text-[13px] text-muted-foreground">
                      {[
                        g.topCategory
                          ? t("groupSub", {
                              count: g.count,
                              category: tc(g.topCategory.key as "OTHER"),
                              share: g.topCategory.share,
                            })
                          : t("debts", { count: g.count }),
                        g.topPayer ? t("groupPayer", { name: g.topPayer.isMe ? t("you") : g.topPayer.name }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-[15px] font-bold num">{m(g.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {facts.length ? (
        <Section title={t("factsTitle")}>
          <ul className="pt-1">
            {facts.map((f) => {
              const row = (
                <>
                  <span className="shrink-0 text-sm text-muted-foreground">{f.label}</span>
                  <span className="truncate text-right text-[15px] font-bold num">{f.value}</span>
                </>
              );
              return (
                <li key={f.label} className="border-b border-line last:border-0">
                  {f.href ? (
                    <Link href={f.href} className="flex items-baseline justify-between gap-3 py-2.5">
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-baseline justify-between gap-3 py-2.5">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <p className="px-5 pt-6 text-center text-xs text-muted-foreground">{t("onlyYours", { currency })}</p>
    </div>
  );
}
