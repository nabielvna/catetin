import { ArrowLeftRight, ChevronRight } from "lucide-react";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PersonActions } from "@/app/[locale]/(main)/people/[id]/person-actions";
import { PersonEntries } from "@/app/[locale]/(main)/people/[id]/person-entries";
import { PersonMenu } from "@/app/[locale]/(main)/people/[id]/person-menu";
import { PersonRecurring } from "@/app/[locale]/(main)/people/[id]/person-recurring";
import { PersonTrust } from "@/app/[locale]/(main)/people/[id]/person-trust";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import {
  BigAmountSkeleton,
  BLANK,
  DatedRowSkeleton,
  InitialSkeleton,
  TabCountSkeleton,
  UnderlineTabsSkeleton,
  WithBlank,
} from "@/components/layout/skeletons";
import { Initial } from "@/components/records/record-parts";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { todayIn } from "@/domain/dates";
import { type Currency, type MoneyByCurrency, nonZeroEntries } from "@/domain/money";
import { computePersonStats, statCurrencies } from "@/domain/stats";
import { Link } from "@/i18n/navigation";
import { money, moneyParts } from "@/lib/format";
import { isUuid } from "@/lib/server/ids";
import type { Actor } from "@/services/context";
import { requireActorPage } from "@/services/page-access";
import {
  mergeCandidates,
  type PersonCore,
  personCore,
  personHasRecords,
  personLedger,
  personOffsets,
  personRecurring,
  personTrust,
} from "@/services/people/queries";
import { statsInput } from "@/services/stats";

export default function PersonPage(props: PageProps<"/[locale]/people/[id]">) {
  const params = props.params.then(({ id }) => ({ partyId: id }));
  return (
    <>
      <Suspense fallback={<PageHeader fallbackHref="/people" />}>
        <Resolve value={Promise.all([params, props.searchParams])}>
          {([{ partyId }, sp]) => <Header partyId={partyId} autoInvite={sp.invite === "1"} />}
        </Resolve>
      </Suspense>
      <section className="flex flex-col gap-4.5 px-5 pt-2.5">
        <Suspense fallback={<IdentitySkeleton />}>
          <Resolve value={params}>{({ partyId }) => <Identity partyId={partyId} />}</Resolve>
        </Suspense>
        <Suspense fallback={<BalanceSkeleton />}>
          <Resolve value={params}>{({ partyId }) => <Balance partyId={partyId} />}</Resolve>
        </Suspense>
        <Suspense fallback={<StatsStripSkeleton />}>
          <Resolve value={params}>{({ partyId }) => <StatsStrip partyId={partyId} />}</Resolve>
        </Suspense>
        <Suspense>
          <Resolve value={params}>{({ partyId }) => <Banners partyId={partyId} />}</Resolve>
        </Suspense>
        <Suspense>
          <Resolve value={params}>{({ partyId }) => <Recurring partyId={partyId} />}</Resolve>
        </Suspense>
        <Suspense>
          <Resolve value={params}>{({ partyId }) => <ManualHint partyId={partyId} />}</Resolve>
        </Suspense>
        <Suspense>
          <Resolve value={params}>{({ partyId }) => <Offset partyId={partyId} />}</Resolve>
        </Suspense>
      </section>
      <Suspense fallback={<EntriesSkeleton />}>
        <Resolve value={params}>{({ partyId }) => <Entries partyId={partyId} />}</Resolve>
      </Suspense>
    </>
  );
}

async function coreOf(partyId: string) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(partyId)) notFound();
  const actor = await requireActorPage(`/people/${partyId}`);
  const c = await personCore(actor, partyId);
  if (!c) notFound();
  return { actor, partyId, c };
}

const firstName = (c: PersonCore) => c.name.split(" ")[0] ?? c.name;

function primaryOf(actor: Actor, net: MoneyByCurrency): Currency {
  const entries = nonZeroEntries(net);
  return net[actor.currency] !== undefined || entries.length === 0
    ? actor.currency
    : entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]![0];
}

async function Header({ partyId, autoInvite }: { partyId: string; autoInvite: boolean }) {
  "use cache: private";
  cacheLife("session");
  const { actor, c } = await coreOf(partyId);
  const [hasRecords, candidates] = await Promise.all([
    personHasRecords(actor, partyId),
    c.isMyManualContact ? mergeCandidates(actor, partyId) : [],
  ]);
  return (
    <PageHeader
      fallbackHref="/people"
      action={<PersonMenu header={{ ...c, hasRecords }} autoInvite={autoInvite} candidates={candidates} />}
    />
  );
}

async function Identity({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { c } = await coreOf(partyId);
  const t = await getTranslations("person");
  const tp = await getTranslations("people");
  const subtitle = [
    c.state === "USER" ? tp("connected") : c.state === "MANUAL" ? tp("manual") : null,
    c.sharedGroups.length ? t("groupsShared", { count: c.sharedGroups.length }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex items-center gap-3">
      <Initial name={c.name} className={c.state === "USER" ? "" : "bg-soft text-foreground"} />
      <div className="flex min-w-0 flex-col gap-px">
        <h1 className="truncate text-xl font-bold tracking-[-0.02em]">
          {c.state === "DELETED" ? t("deleted", { name: c.name }) : c.name}
        </h1>
        {subtitle ? <span className="text-[13px] text-muted-foreground">{subtitle}</span> : null}
      </div>
    </div>
  );
}

async function Balance({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, c } = await coreOf(partyId);
  const ledger = await personLedger(actor, partyId);
  const locale = await getLocale();
  const t = await getTranslations("person");
  const tm = await getTranslations("money");

  const primary = primaryOf(actor, ledger.net);
  const primaryNet = ledger.net[primary] ?? 0;
  const others = nonZeroEntries(ledger.net).filter(([cur]) => cur !== primary);
  const parts = moneyParts(primaryNet, primary, locale);
  const first = firstName(c);

  const summaryLine = [
    t("summary", { active: ledger.activeCount }),
    ledger.waitingThem ? t("waitingThem", { count: ledger.waitingThem, name: first }) : null,
    ledger.waitingMe ? t("waitingYou", { count: ledger.waitingMe }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const balanceLabel =
    primaryNet > 0
      ? tm("theyOweYou", { name: first })
      : primaryNet < 0
        ? tm("youOweThem", { name: first })
        : tm("allSettled");

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span
          className={`text-[13px] font-medium ${primaryNet > 0 ? "text-pos" : primaryNet < 0 ? "text-neg" : "text-muted-foreground"}`}
        >
          {balanceLabel}
        </span>
        <div
          className="flex items-baseline gap-1 leading-none"
          aria-label={money(Math.abs(primaryNet), primary, locale)}
        >
          <span className="text-[26px] font-bold tracking-[-0.03em]">{parts.symbol}</span>
          <span className="text-[54px] font-extrabold num tracking-tighter">{parts.number}</span>
        </div>
        {others.length > 0 ? (
          <span className="text-[13px] text-muted-foreground">
            + {others.map(([cur, v]) => money(v, cur, locale, "always")).join(", ")}
          </span>
        ) : null}
        <span className="text-[13px] text-muted-foreground">{summaryLine}</span>
      </div>

      <PersonActions
        partyId={c.partyId}
        pairId={c.pairId}
        name={first}
        theyOwe={primaryNet > 0}
        iOwe={primaryNet < 0}
        canRemind={Object.keys(ledger.owedToMe).length > 0 && (c.state === "USER" || !!c.email)}
        state={c.state}
      />
    </>
  );
}

async function StatsStrip({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, c } = await coreOf(partyId);
  const all = await statsInput(actor);
  const currencies = statCurrencies(
    { ...all, obligations: all.obligations.filter((o) => o.counterpartId === partyId) },
    actor.currency,
  );
  if (currencies.length === 0) return null;
  const s = computePersonStats(all, partyId, {
    period: "all",
    currency: currencies[0]!,
    today: todayIn(actor.timezone, new Date()),
  });
  const [t, tc] = await Promise.all([getTranslations("stats"), getTranslations("categories")]);
  const cells = [
    s.habits.them.medianDays !== null
      ? { label: t("strip.typical"), value: t("days", { count: s.habits.them.medianDays }) }
      : null,
    s.habits.them.dueCount
      ? { label: t("strip.onTime"), value: t("ofTotal", { done: s.habits.them.onTime, total: s.habits.them.dueCount }) }
      : null,
    s.categoriesIn[0] ? { label: t("strip.category"), value: tc(s.categoriesIn[0].key as "OTHER") } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);
  return (
    <Link href={`/people/${partyId}/stats`} data-tour="person.stats" className="flex flex-col border-y border-line">
      {cells.length ? (
        <span className="grid pt-3 pb-1" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
          {cells.map((x, i) => (
            <span key={x.label} className={`flex min-w-0 flex-col gap-0.5 ${i ? "border-l border-line pl-3" : ""}`}>
              <span className="truncate text-xs text-muted-foreground">{x.label}</span>
              <span className="truncate text-base font-bold num">{x.value}</span>
            </span>
          ))}
        </span>
      ) : null}
      <span className="flex h-11 items-center justify-between text-[13px] font-semibold">
        {t("personLink", { name: firstName(c) })}
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </Link>
  );
}

async function Banners({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, c } = await coreOf(partyId);
  const trust = c.blocked ? null : await personTrust(actor, partyId);
  const t = await getTranslations("person");
  const first = firstName(c);
  return (
    <>
      {c.blocked ? (
        <p className="rounded-md bg-soft px-3.5 py-3 text-[13px] text-muted-foreground">
          {t("block.banner", { name: first })}
        </p>
      ) : trust ? (
        <PersonTrust partyId={c.partyId} name={first} state={trust} />
      ) : null}
      {c.archived ? (
        <p className="rounded-md bg-soft px-3.5 py-3 text-[13px] text-muted-foreground">{t("archive.banner")}</p>
      ) : null}
    </>
  );
}

async function Recurring({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, c } = await coreOf(partyId);
  return <PersonRecurring items={await personRecurring(actor, partyId)} name={firstName(c)} />;
}

async function ManualHint({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { c } = await coreOf(partyId);
  if (!(c.state === "MANUAL" && c.isMyManualContact)) return null;
  const t = await getTranslations("person");
  return (
    <p className="rounded-md bg-soft px-3.5 py-3 text-[13px] text-muted-foreground">
      {t("manualHint", { name: firstName(c) })}
    </p>
  );
}

async function Offset({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, c } = await coreOf(partyId);
  if (!c.pairId || c.blocked) return null;
  const [offsets, ledger] = await Promise.all([personOffsets(actor, partyId), personLedger(actor, partyId)]);
  const primary = primaryOf(actor, ledger.net);
  const offset = offsets.find((o) => o.currency === primary) ?? offsets[0];
  if (!offset) return null;
  const locale = await getLocale();
  const t = await getTranslations("person");
  return (
    <Link
      href={`/payments/new?with=${c.partyId}&kind=offset&currency=${offset.currency}`}
      data-tour="person.offset"
      className="flex items-center gap-3 rounded-md bg-soft px-3.5 py-3"
    >
      <ArrowLeftRight className="size-5 shrink-0" />
      <span className="flex-1 text-[13px] leading-snug">
        {t.rich("offsetBanner", {
          amount: money(offset.max, offset.currency, locale),
          b: (ch) => <b className="font-bold">{ch}</b>,
        })}
      </span>
      <ChevronRight className="size-4.5 shrink-0" />
    </Link>
  );
}

async function Entries({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, c } = await coreOf(partyId);
  const ledger = await personLedger(actor, partyId);
  return <PersonEntries entries={ledger.entries} name={firstName(c)} labels={ledger.labels} />;
}

function IdentitySkeleton() {
  return (
    <div className="flex items-center gap-3" aria-busy>
      <InitialSkeleton />
      <div className="flex min-w-0 flex-col gap-px">
        <h1 className="truncate text-xl font-bold tracking-[-0.02em]">
          <SkeletonText w="7em" />
        </h1>
        <span className="text-[13px] text-muted-foreground">
          <SkeletonText w="10ch" />
        </span>
      </div>
    </div>
  );
}

function BalanceSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-1.5" aria-busy>
        <span className="text-[13px] font-medium">
          <SkeletonText w="16ch" />
        </span>
        <BigAmountSkeleton />
        <span className="text-[13px] text-muted-foreground">
          <SkeletonText w="12ch" />
        </span>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-12 flex-2" />
        <Skeleton className="h-12 flex-2" />
      </div>
    </>
  );
}

function StatsStripSkeleton() {
  const t = useTranslations("stats");
  return (
    <div className="flex flex-col border-y border-line" aria-busy>
      <span className="grid grid-cols-3 pt-3 pb-1">
        {[t("strip.typical"), t("strip.onTime"), t("strip.category")].map((label, i) => (
          <span key={label} className={`flex min-w-0 flex-col gap-0.5 ${i ? "border-l border-line pl-3" : ""}`}>
            <span className="truncate text-xs text-muted-foreground">{label}</span>
            <span className="truncate text-base font-bold num">
              <SkeletonText w="6ch" />
            </span>
          </span>
        ))}
      </span>
      <span className="flex h-11 items-center justify-between text-[13px] font-semibold">
        <WithBlank text={t("personLink", { name: BLANK })} w="4ch" />
        <ChevronRight className="size-4" aria-hidden />
      </span>
    </div>
  );
}

function EntriesSkeleton() {
  const t = useTranslations("person");
  return (
    <section className="mt-6" aria-busy>
      <UnderlineTabsSkeleton
        labels={[
          <>
            {t("tabs.active")}
            <TabCountSkeleton />
          </>,
          <>
            {t("tabs.settled")}
            <TabCountSkeleton />
          </>,
          t("tabs.history"),
        ]}
      />
      <ul className="px-5">
        <DatedRowSkeleton />
        <DatedRowSkeleton title="8ch" sub="12ch" />
        <DatedRowSkeleton title="13ch" />
      </ul>
    </section>
  );
}
