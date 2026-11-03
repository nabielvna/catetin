import { ChevronRight, Tag } from "lucide-react";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DebtDecision, DebtMenu } from "@/app/[locale]/(main)/debts/[id]/debt-client";
import { DebtLabels } from "@/app/[locale]/(main)/debts/[id]/debt-labels";
import { TrustDispute } from "@/components/approvals/trust-dispute";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { ActivitySkeleton, BigAmountSkeleton, StatusPillSkeleton } from "@/components/layout/skeletons";
import { ActivityList } from "@/components/records/activity-list";
import { Evidence, EvidenceSkeleton } from "@/components/records/attachment-list";
import { StatusPill } from "@/components/records/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { formatDate, money, moneyParts } from "@/lib/format";
import { isUuid } from "@/lib/server/ids";
import { cn } from "@/lib/utils";
import { listDisputable } from "@/services/approvals/disputes";
import {
  obligationActivity,
  type ObligationCore,
  obligationCore,
  obligationItems,
  obligationLabels,
  obligationPayments,
  obligationPending,
  obligationReserved,
} from "@/services/debts/queries";
import { listAttachments } from "@/services/files";
import { listLabels } from "@/services/labels";
import { requireActorPage } from "@/services/page-access";

export default function DebtPage(props: PageProps<"/[locale]/debts/[id]">) {
  const { params } = props;
  return (
    <>
      <Suspense fallback={<PageHeader />}>
        <Resolve value={params}>{({ id }) => <Header id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<SummarySkeleton />}>
        <Resolve value={params}>{({ id }) => <Summary id={id} />}</Resolve>
      </Suspense>
      <Suspense>
        <Resolve value={params}>{({ id }) => <Decision id={id} />}</Resolve>
      </Suspense>
      <Suspense>
        <Resolve value={params}>{({ id }) => <Disputes id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<PayButtonSkeleton />}>
        <Resolve value={params}>{({ id }) => <PayButton id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<DetailsSkeleton />}>
        <Resolve value={params}>{({ id }) => <Details id={id} />}</Resolve>
      </Suspense>
      <Suspense>
        <Resolve value={params}>{({ id }) => <Items id={id} />}</Resolve>
      </Suspense>
      <Suspense>
        <Resolve value={params}>{({ id }) => <Payments id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<EvidenceSkeleton />}>
        <Resolve value={params}>{({ id }) => <DebtEvidence id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<HistorySkeleton />}>
        <Resolve value={params}>{({ id }) => <History id={id} />}</Resolve>
      </Suspense>
    </>
  );
}

async function load(id: string) {
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/debts/${id}`);
  return { actor, id };
}

async function coreOf(id: string) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/debts/${id}`);
  const d = await obligationCore(actor, id);
  if (!d) notFound();
  return { actor, id, d };
}

const firstName = (d: ObligationCore) => d.counterpart.name.split(" ")[0] ?? d.counterpart.name;

async function Header({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, d } = await coreOf(id);
  if (d.readOnly) return <PageHeader fallbackHref={`/people/${d.counterpart.partyId}`} />;
  const [pending, reserved] = await Promise.all([obligationPending(actor, id), obligationReserved(actor, id)]);
  return (
    <PageHeader
      fallbackHref={`/people/${d.counterpart.partyId}`}
      action={
        <DebtMenu
          id={d.id}
          status={d.status}
          iCreated={d.iCreated}
          iAmCreditor={d.iAmCreditor}
          hasPayments={d.paid > 0 || reserved > 0}
          remaining={d.amount - d.paid - reserved}
          currency={d.currency}
          name={firstName(d)}
          pendingRequestId={pending?.requestedByMe ? pending.requestId : null}
        />
      }
    />
  );
}

async function Summary({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { d } = await coreOf(id);
  const locale = await getLocale();
  const t = await getTranslations("debt");
  const tm = await getTranslations("money");

  const remaining = d.amount - d.paid;
  const settled = d.status === "ACTIVE" && remaining === 0;
  const status = settled ? "SETTLED" : d.status;
  const sign = d.iAmCreditor ? 1 : d.iAmDebtor ? -1 : 0;
  const parts = moneyParts(d.amount, d.currency, locale);
  const other = firstName(d);
  const direction = d.readOnly
    ? `${d.debtorName} → ${d.creditorName}`
    : d.iAmCreditor
      ? tm("theyOweYou", { name: other })
      : tm("youOweThem", { name: other });
  const progress = d.amount > 0 ? Math.round((d.paid / d.amount) * 100) : 0;

  return (
    <section className="flex flex-col gap-4 px-5 pt-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          {d.createdVia === "ASSISTANT" || d.createdVia === "SPLIT" ? (
            <span className="text-xs text-muted-foreground">{t(`via.${d.createdVia}`)}</span>
          ) : d.recurringId ? (
            <span className="text-xs text-muted-foreground">{t("fromRecurring")}</span>
          ) : null}
        </div>
        <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-balance">{d.title}</h1>
        <Link
          href={`/people/${d.counterpart.partyId}`}
          className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground"
        >
          <span className={sign > 0 ? "text-pos" : sign < 0 ? "text-neg" : ""}>{direction}</span>
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-2xl font-bold tracking-[-0.03em]">{parts.symbol}</span>
        <span className="text-5xl font-extrabold num tracking-tighter">{parts.number}</span>
      </div>
      {d.status === "ACTIVE" ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden>
            <div className="h-full rounded-full bg-foreground" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-[13px] text-muted-foreground">
            <span>
              {t("paid")} {money(d.paid, d.currency, locale)}
            </span>
            <span className="font-semibold text-foreground">
              {settled ? tm("settled") : `${t("remaining")} ${money(remaining, d.currency, locale)}`}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

async function Decision({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, d } = await coreOf(id);
  const pending = await obligationPending(actor, id);
  if (!pending) return null;
  return <DebtDecision detail={{ ...d, pending }} name={firstName(d)} />;
}

async function Disputes({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor } = await load(id);
  return <TrustDispute items={await listDisputable(actor, new Date(), id)} />;
}

async function PayButton({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { d } = await coreOf(id);
  if (d.status !== "ACTIVE" || d.amount - d.paid <= 0 || d.readOnly) return null;
  const tp = await getTranslations("payment");
  const tperson = await getTranslations("person");
  return (
    <div className="px-5 pt-5">
      <Button asChild className="w-full">
        <Link
          href={`/payments/new?with=${d.counterpart.partyId}&dir=${d.iAmCreditor ? "in" : "out"}&obligation=${d.id}`}
        >
          {d.iAmCreditor ? tperson("receive") : tp("payTitle", { name: firstName(d) })}
        </Link>
      </Button>
    </div>
  );
}

async function Details({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { d } = await coreOf(id);
  const locale = await getLocale();
  const t = await getTranslations("debt");
  const tp = await getTranslations("payment");
  const tcat = await getTranslations("categories");

  const rows: Array<[string, React.ReactNode]> = [
    [t("date"), formatDate(d.occurredOn, locale)],
    ...(d.dueOn && !d.installments
      ? ([[t("due"), formatDate(d.dueOn, locale)]] as Array<[string, React.ReactNode]>)
      : []),
    ...(d.category ? ([[t("category"), tcat(d.category as "FOOD")]] as Array<[string, React.ReactNode]>) : []),
    ...(d.group
      ? ([
          [
            t("group"),
            <Link key="g" href={`/groups/${d.group.id}`} className="underline underline-offset-2">
              {d.group.name}
            </Link>,
          ],
        ] as Array<[string, React.ReactNode]>)
      : []),
    ...(d.sourceSettlementId
      ? ([
          [
            t("excessOf"),
            <Link key="x" href={`/payments/${d.sourceSettlementId}`} className="underline underline-offset-2">
              {tp("detail")}
            </Link>,
          ],
        ] as Array<[string, React.ReactNode]>)
      : []),
    ...(d.bill
      ? ([
          [
            tp("allocation"),
            <Link key="b" href={`/bills/${d.bill.id}`} className="underline underline-offset-2">
              {d.bill.title}
            </Link>,
          ],
        ] as Array<[string, React.ReactNode]>)
      : []),
  ];

  return (
    <>
      {d.installments ? (
        <section className="px-5 pt-6">
          <h2 className="pb-1 text-base font-bold">
            {t("installments")}{" "}
            <span className="font-medium text-muted-foreground">
              · {d.installments.plan.count}×{" "}
              {t(d.installments.plan.every === "WEEK" ? "perWeek" : "perMonth").toLowerCase()}
            </span>
          </h2>
          <ol>
            {d.installments.schedule.map((it) => (
              <li
                key={it.seq}
                className={cn(
                  "flex items-center justify-between gap-3 border-b border-line py-2.5 text-[15px] last:border-0",
                  it.state === "PAID" && "text-muted-foreground",
                )}
              >
                <span className="flex items-center gap-2">
                  <span className="w-7 text-[13px] num text-muted-foreground">{it.seq}.</span>
                  <span className={it.seq === d.installments!.nextSeq ? "font-semibold" : ""}>
                    {formatDate(it.dueOn, locale)}
                  </span>
                  {it.seq === d.installments!.nextSeq && d.status === "ACTIVE" ? (
                    <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] font-semibold">
                      {t("installmentNext")}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[12px]">{t(`installmentState.${it.state}`)}</span>
                  <span className={cn("font-medium num", it.state === "PAID" && "line-through")}>
                    {money(it.amount, d.currency, locale)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <dl className="mt-6 flex flex-col px-5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line py-3 text-[15px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
        <Suspense fallback={<LabelsRowSkeleton />}>
          <Labels id={id} />
        </Suspense>
        {d.note ? (
          <div className="flex flex-col gap-1 border-b border-line py-3">
            <dt className="text-[15px] text-muted-foreground">{t("note")}</dt>
            <dd className="text-[15px] whitespace-pre-wrap">{d.note}</dd>
          </div>
        ) : null}
      </dl>
    </>
  );
}

async function Labels({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor } = await load(id);
  const [labels, mine] = await Promise.all([obligationLabels(actor, id), listLabels(actor.userId)]);
  return <DebtLabels id={id} labels={labels} suggestions={mine.map((l) => l.name)} />;
}

async function Items({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, d } = await coreOf(id);
  const items = await obligationItems(actor, id);
  if (items.length === 0) return null;
  const locale = await getLocale();
  const t = await getTranslations("debt");
  return (
    <section className="px-5 pt-6">
      <h2 className="pb-1 text-base font-bold">{t("items")}</h2>
      <ul>
        {items.map((it, i) => (
          <li key={i} className="flex justify-between gap-3 border-b border-line py-2.5 text-[15px] last:border-0">
            <span>
              {it.qtyMilli !== 1000 ? `${it.qtyMilli / 1000}× ` : ""}
              {it.name}
            </span>
            <span className="font-medium num">{money(it.lineTotal, d.currency, locale)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Payments({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, d } = await coreOf(id);
  const payments = await obligationPayments(actor, id);
  if (payments.length === 0) return null;
  const locale = await getLocale();
  const t = await getTranslations("debt");
  const tp = await getTranslations("payment");
  return (
    <section className="px-5 pt-6">
      <h2 className="pb-1 text-base font-bold">{t("payments")}</h2>
      <ul>
        {payments.map((p) => (
          <li key={p.id} className="border-b border-line last:border-0">
            <Link href={`/payments/${p.id}`} className="flex items-center justify-between gap-3 py-3">
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold">
                  {tp(`kind.${p.kind}`)}
                  {p.method ? ` · ${tp(`methods.${p.method as "CASH"}`)}` : ""}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {formatDate(p.paidOn, locale)}
                  {p.status !== "ACTIVE"
                    ? ` · ${t(`status.${p.status === "CANCELLED" ? "VOID" : (p.status as "PENDING")}`)}`
                    : ""}
                </span>
              </span>
              <span
                className={`text-[15px] font-bold num ${p.status === "ACTIVE" ? "" : "text-muted-foreground line-through"}`}
              >
                {money(p.amount, d.currency, locale)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function DebtEvidence({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, d } = await coreOf(id);
  const evidence = await listAttachments(actor, { type: "OBLIGATION", id });
  return (
    <Evidence
      target={{ type: "OBLIGATION", id }}
      items={evidence}
      canAdd={!d.readOnly && (d.status === "ACTIVE" || d.status === "PENDING")}
    />
  );
}

async function History({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, d } = await coreOf(id);
  const activity = await obligationActivity(actor, id);
  const t = await getTranslations("debt");
  return (
    <section className="px-5 pt-6 pb-10">
      <h2 className="pb-1 text-base font-bold">{t("history")}</h2>
      <ActivityList items={activity} currency={d.currency} />
    </section>
  );
}

function SummarySkeleton() {
  const t = useTranslations("debt");
  return (
    <section className="flex flex-col gap-4 px-5 pt-2" aria-busy>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <StatusPillSkeleton />
        </div>
        <h1 className="text-2xl font-extrabold tracking-[-0.03em]">
          <SkeletonText w="9em" />
        </h1>
        <span className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
          <span>
            <SkeletonText w="14ch" />
          </span>
          <ChevronRight className="size-3.5" />
        </span>
      </div>
      <BigAmountSkeleton size="md" />
      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-soft" aria-hidden />
        <div className="flex justify-between text-[13px] text-muted-foreground">
          <span>
            {t("paid")} <SkeletonText w="7ch" />
          </span>
          <span className="font-semibold text-foreground">
            {t("remaining")} <SkeletonText w="7ch" />
          </span>
        </div>
      </div>
    </section>
  );
}

function PayButtonSkeleton() {
  return (
    <div className="px-5 pt-5" aria-busy>
      <Skeleton className="h-12" />
    </div>
  );
}

function LabelsRowSkeleton() {
  const t = useTranslations("labels");
  return (
    <div className="flex w-full items-center justify-between gap-4 border-b border-line py-3 text-[15px]">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Tag className="size-4" /> {t("title")}
      </span>
      <span className="truncate text-right font-medium">
        <SkeletonText w="6ch" />
      </span>
    </div>
  );
}

function DetailsSkeleton() {
  const t = useTranslations("debt");
  return (
    <dl className="mt-6 flex flex-col px-5" aria-busy>
      <div className="flex justify-between gap-4 border-b border-line py-3 text-[15px]">
        <dt className="text-muted-foreground">{t("date")}</dt>
        <dd className="text-right font-medium">
          <SkeletonText w="10ch" />
        </dd>
      </div>
      <LabelsRowSkeleton />
    </dl>
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
