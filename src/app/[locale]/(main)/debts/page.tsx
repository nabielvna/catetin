import { Search } from "lucide-react";
import { cacheLife } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { debtFacets } from "@/app/[locale]/(main)/debts/debt-filters";
import { RecordsView } from "@/app/[locale]/(main)/records/record-filters";
import { RecordsSkeleton } from "@/app/[locale]/(main)/records/records-view";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { Amount, DateBlock, EmptyState } from "@/components/records/record-parts";
import { nonZeroEntries } from "@/domain/money";
import { filterRecords, isDefaultRecordFilter, openNet, parseRecordFilter, type RecordRow } from "@/domain/records";
import { Link } from "@/i18n/navigation";
import { formatDate, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireActorPage } from "@/services/page-access";
import { allRecords } from "@/services/records";

export default async function RecordsPage(props: PageProps<"/[locale]/debts">) {
  const t = await getTranslations("records");
  const tn = await getTranslations("nav");
  return (
    <>
      <PageHeader
        title={t("title")}
        action={
          <Link href="/search" aria-label={tn("search")} className="flex size-11 items-center justify-center">
            <Search className="size-5.5" strokeWidth={1.8} />
          </Link>
        }
      />
      <Suspense
        fallback={
          <Suspense fallback={<RecordsSkeleton />}>
            <Resolve value={props.searchParams}>{(sp) => <RecordsSkeleton filter={parseRecordFilter(sp)} />}</Resolve>
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
  const actor = await requireActorPage("/debts");
  const [all, locale, t] = await Promise.all([allRecords(actor), getLocale(), getTranslations("records")]);
  const filter = parseRecordFilter(sp);
  const rows = filterRecords(all, filter);
  const shown = await debtFacets(all, filter, locale);

  const net = nonZeroEntries(openNet(rows)).sort(([a], [b]) =>
    a === actor.currency ? -1 : b === actor.currency ? 1 : a.localeCompare(b),
  );
  const summary = [
    t("count", { count: rows.length }),
    net.length ? t("remaining", { amount: net.map(([c, v]) => money(v, c, locale, "always")).join(", ") }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (all.length === 0) {
    return (
      <div className="px-5 pt-6">
        <EmptyState body={t("none")} />
      </div>
    );
  }

  return (
    <div className="flex flex-col px-5 pb-10">
      <RecordsView filter={filter} facets={shown} summary={summary} isDefault={isDefaultRecordFilter(filter)}>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : filter.sort === "largest" ? (
          <ul>
            {rows.map((r) => (
              <RecordItem key={r.id} r={r} locale={locale} />
            ))}
          </ul>
        ) : (
          byMonth(rows).map(([month, items]) => (
            <section key={month}>
              <h2 className="pt-5 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {formatDate(`${month}-01`, locale, { month: "long", year: "numeric" })}
              </h2>
              <ul>
                {items.map((r) => (
                  <RecordItem key={r.id} r={r} locale={locale} />
                ))}
              </ul>
            </section>
          ))
        )}
      </RecordsView>
    </div>
  );
}

function byMonth(rows: RecordRow[]): Array<[string, RecordRow[]]> {
  const out = new Map<string, RecordRow[]>();
  for (const r of rows) {
    const m = r.occurredOn.slice(0, 7);
    out.set(m, [...(out.get(m) ?? []), r]);
  }
  return [...out];
}

async function RecordItem({ r, locale }: { r: RecordRow; locale: string }) {
  const t = await getTranslations("records");
  const td = await getTranslations("debt");
  const th = await getTranslations("home");
  const who = r.groupName
    ? `${r.groupName} · ${r.direction === "I_OWE" ? th("toPerson", { name: r.counterpartName }) : r.counterpartName}`
    : r.counterpartName;
  const state =
    r.pendingWith === "THEM"
      ? td("waitingFor", { name: r.counterpartName })
      : r.pendingWith === "ME"
        ? td("status.PENDING")
        : r.status === "OPEN"
          ? null
          : t(`status.${r.status}`);
  const sub = [who, state, ...r.labels.map((l) => `#${l}`)].filter(Boolean).join(" · ");
  const open = r.status === "OPEN";
  return (
    <li className="border-b border-line last:border-0">
      <Link href={`/debts/${r.id}`} className="flex items-center gap-3.5 py-3">
        <DateBlock date={r.occurredOn} locale={locale} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn("truncate text-[15px] font-semibold", r.status === "CLOSED" && "line-through opacity-60")}
          >
            {r.title}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">{sub}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Amount
            value={(r.direction === "THEY_OWE" ? 1 : -1) * (open ? r.remaining : r.amount)}
            currency={r.currency}
            locale={locale}
            tone={open ? undefined : "muted"}
            className="text-[15px]"
          />
          {open && r.remaining !== r.amount ? (
            <span className="text-xs num text-muted-foreground">
              {th("ofAmount", { amount: money(r.amount, r.currency, locale) })}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
