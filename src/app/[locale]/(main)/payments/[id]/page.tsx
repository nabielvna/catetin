import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PaymentActions } from "@/app/[locale]/(main)/payments/[id]/payment-client";
import { TrustDispute } from "@/components/approvals/trust-dispute";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { ActivitySkeleton, BigAmountSkeleton, StatusPillSkeleton } from "@/components/layout/skeletons";
import { ActivityList } from "@/components/records/activity-list";
import { Evidence, EvidenceSkeleton } from "@/components/records/attachment-list";
import { StatusPill } from "@/components/records/status-badge";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { formatDate, money, moneyParts } from "@/lib/format";
import { isUuid } from "@/lib/server/ids";
import { listDisputable } from "@/services/approvals/disputes";
import { activityFor } from "@/services/debts/queries";
import { listAttachments } from "@/services/files";
import { requireActorPage } from "@/services/page-access";
import {
  settlementAllocations,
  type SettlementCore,
  settlementCore,
  settlementExcess,
  settlementPending,
} from "@/services/payments/queries";

export default function PaymentPage(props: PageProps<"/[locale]/payments/[id]">) {
  const { params } = props;
  return (
    <>
      <Suspense fallback={<PageHeader />}>
        <Resolve value={params}>{({ id }) => <Header id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<SummarySkeleton />}>
        <Resolve value={params}>{({ id }) => <Summary id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<ActionsSkeleton />}>
        <Resolve value={params}>{({ id }) => <Actions id={id} />}</Resolve>
      </Suspense>
      <Suspense>
        <Resolve value={params}>{({ id }) => <Disputes id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<DetailsSkeleton />}>
        <Resolve value={params}>{({ id }) => <Details id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<AllocationsSkeleton />}>
        <Resolve value={params}>{({ id }) => <Allocations id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<EvidenceSkeleton />}>
        <Resolve value={params}>{({ id }) => <PaymentEvidence id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<HistorySkeleton />}>
        <Resolve value={params}>{({ id }) => <History id={id} />}</Resolve>
      </Suspense>
    </>
  );
}

async function load(id: string) {
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/payments/${id}`);
  return { actor, id };
}

async function coreOf(id: string) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/payments/${id}`);
  const s = await settlementCore(actor, id);
  if (!s) notFound();
  return { actor, id, s };
}

const firstName = (s: SettlementCore) => s.counterpart.name.split(" ")[0] ?? s.counterpart.name;

async function Header({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { s } = await coreOf(id);
  return <PageHeader fallbackHref={`/people/${s.counterpart.partyId}`} />;
}

async function Summary({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { s } = await coreOf(id);
  const locale = await getLocale();
  const t = await getTranslations("payment");
  const tc = await getTranslations("common");
  const name = firstName(s);
  const parts = moneyParts(s.amount, s.currency, locale);
  const status = s.status === "CANCELLED" ? "VOID" : (s.status as "ACTIVE");
  const title =
    s.kind === "PAYMENT"
      ? `${t("kind.PAYMENT")}${s.method ? ` · ${t(`methods.${s.method as "CASH"}`)}` : ""}`
      : t(`kind.${s.kind}`);
  const direction = s.kind === "OFFSET" ? name : s.iAmPayer ? `${tc("you_cap")} → ${name}` : `${name} → ${tc("you")}`;

  return (
    <section className="flex flex-col gap-3 px-5 pt-2">
      <StatusPill status={status} />
      <h1 className="text-2xl font-extrabold tracking-[-0.03em]">{title}</h1>
      <Link href={`/people/${s.counterpart.partyId}`} className="text-[13px] font-medium text-muted-foreground">
        {direction}
      </Link>
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-2xl font-bold tracking-[-0.03em]">{parts.symbol}</span>
        <span className="text-5xl font-extrabold num tracking-tighter">{parts.number}</span>
      </div>
      {s.counterCurrency && s.counterAmount !== null ? (
        <span className="text-[13px] text-muted-foreground">
          = {money(s.counterAmount, s.counterCurrency, locale)} · 1 {s.currency} = {s.rate} {s.counterCurrency}
        </span>
      ) : null}
    </section>
  );
}

async function Actions({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, s } = await coreOf(id);
  const pending = await settlementPending(actor, id);
  return <PaymentActions detail={{ ...s, pending }} name={firstName(s)} />;
}

async function Disputes({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor } = await load(id);
  return <TrustDispute items={await listDisputable(actor, new Date(), id)} />;
}

async function Details({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { s } = await coreOf(id);
  const locale = await getLocale();
  const t = await getTranslations("payment");
  return (
    <dl className="mt-6 flex flex-col px-5">
      <div className="flex justify-between gap-4 border-b border-line py-3 text-[15px]">
        <dt className="text-muted-foreground">{t("date")}</dt>
        <dd className="font-medium">{formatDate(s.paidOn, locale)}</dd>
      </div>
      {s.note ? (
        <div className="flex flex-col gap-1 border-b border-line py-3">
          <dt className="text-[15px] text-muted-foreground">{t("note")}</dt>
          <dd className="text-[15px] whitespace-pre-wrap">{s.note}</dd>
        </div>
      ) : null}
    </dl>
  );
}

async function Allocations({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, s } = await coreOf(id);
  const [allocations, excess] = await Promise.all([settlementAllocations(actor, id), settlementExcess(actor, id)]);
  const locale = await getLocale();
  const t = await getTranslations("payment");
  const td = await getTranslations("debt");
  const name = firstName(s);
  return (
    <section className="px-5 pt-6">
      <h2 className="pb-1 text-base font-bold">{t("allocation")}</h2>
      <ul>
        {allocations.map((a) => (
          <li key={a.obligationId} className="border-b border-line last:border-0">
            <Link href={`/debts/${a.obligationId}`} className="flex items-center justify-between gap-3 py-3">
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold">{a.title}</span>
                {s.kind === "OFFSET" ? (
                  <span className="text-xs text-muted-foreground">
                    {a.direction === "THEY_OWE" ? td("theyOwe", { name }) : td("iOwe")}
                  </span>
                ) : null}
              </span>
              <span className="text-[15px] font-bold num">{money(a.amount, a.currency, locale)}</span>
            </Link>
          </li>
        ))}
        {excess ? (
          <li className="border-b border-line last:border-0">
            <Link href={`/debts/${excess.obligationId}`} className="flex items-center justify-between gap-3 py-3">
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold">{t("excessTitle")}</span>
                <span className="text-xs text-muted-foreground">
                  {s.iAmPayer ? td("theyOwe", { name }) : td("iOwe")}
                  {excess.status !== "ACTIVE" ? ` · ${td(`status.${excess.status as "PENDING"}`)}` : ""}
                </span>
              </span>
              <span className="text-[15px] font-bold num">{money(excess.amount, excess.currency, locale)}</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

async function PaymentEvidence({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, s } = await coreOf(id);
  const evidence = await listAttachments(actor, { type: "SETTLEMENT", id });
  return (
    <Evidence
      target={{ type: "SETTLEMENT", id }}
      items={evidence}
      canAdd={s.status === "ACTIVE" || s.status === "PENDING"}
    />
  );
}

async function History({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, s } = await coreOf(id);
  const activity = await activityFor(actor, "SETTLEMENT", id);
  const td = await getTranslations("debt");
  return (
    <section className="px-5 pt-6 pb-10">
      <h2 className="pb-1 text-base font-bold">{td("history")}</h2>
      <ActivityList items={activity} currency={s.currency} />
    </section>
  );
}

function SummarySkeleton() {
  return (
    <section className="flex flex-col gap-3 px-5 pt-2" aria-busy>
      <span className="flex">
        <StatusPillSkeleton />
      </span>
      <h1 className="text-2xl font-extrabold tracking-[-0.03em]">
        <SkeletonText w="7em" />
      </h1>
      <span className="text-[13px] font-medium text-muted-foreground">
        <SkeletonText w="12ch" />
      </span>
      <BigAmountSkeleton size="md" />
    </section>
  );
}

function ActionsSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-5" aria-busy>
      <Skeleton className="h-12" />
    </div>
  );
}

function DetailsSkeleton() {
  const t = useTranslations("payment");
  return (
    <dl className="mt-6 flex flex-col px-5" aria-busy>
      <div className="flex justify-between gap-4 border-b border-line py-3 text-[15px]">
        <dt className="text-muted-foreground">{t("date")}</dt>
        <dd className="font-medium">
          <SkeletonText w="10ch" />
        </dd>
      </div>
    </dl>
  );
}

function AllocationsSkeleton() {
  const t = useTranslations("payment");
  return (
    <section className="px-5 pt-6" aria-busy>
      <h2 className="pb-1 text-base font-bold">{t("allocation")}</h2>
      <ul>
        <li className="border-b border-line last:border-0">
          <div className="flex items-center justify-between gap-3 py-3">
            <span className="text-[15px] font-semibold">
              <SkeletonText w="12ch" />
            </span>
            <span className="text-[15px] font-bold num">
              <SkeletonText w="6ch" />
            </span>
          </div>
        </li>
      </ul>
    </section>
  );
}

function HistorySkeleton() {
  const t = useTranslations("debt");
  return (
    <section className="px-5 pt-6 pb-10" aria-busy>
      <h2 className="pb-1 text-base font-bold">{t("history")}</h2>
      <ActivitySkeleton />
    </section>
  );
}
