import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { ActivitySkeleton, BigAmountSkeleton, InitialSkeleton } from "@/components/layout/skeletons";
import { ActivityList } from "@/components/records/activity-list";
import { Evidence, EvidenceSkeleton } from "@/components/records/attachment-list";
import { Initial } from "@/components/records/record-parts";
import { SkeletonText } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { formatDate, money, moneyParts } from "@/lib/format";
import { isUuid } from "@/lib/server/ids";
import { cn } from "@/lib/utils";
import { billCore, billShares } from "@/services/bills/queries";
import { activityFor } from "@/services/debts/queries";
import { listAttachments } from "@/services/files";
import { requireActorPage } from "@/services/page-access";

export default function BillPage(props: PageProps<"/[locale]/bills/[id]">) {
  const { params } = props;
  return (
    <>
      <Suspense fallback={<PageHeader />}>
        <Resolve value={params}>{({ id }) => <Header id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<SummarySkeleton />}>
        <Resolve value={params}>{({ id }) => <Summary id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<SharesSkeleton />}>
        <Resolve value={params}>{({ id }) => <Shares id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<TotalsSkeleton />}>
        <Resolve value={params}>{({ id }) => <Totals id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<EvidenceSkeleton />}>
        <Resolve value={params}>{({ id }) => <BillEvidence id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<HistorySkeleton />}>
        <Resolve value={params}>{({ id }) => <History id={id} />}</Resolve>
      </Suspense>
    </>
  );
}

async function billOf(id: string) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/bills/${id}`);
  const b = await billCore(actor, id);
  if (!b) notFound();
  return { actor, id, b };
}

async function Header({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { b } = await billOf(id);
  return <PageHeader fallbackHref={b.group ? `/groups/${b.group.id}` : "/home"} />;
}

async function Summary({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { b } = await billOf(id);
  const locale = await getLocale();
  const t = await getTranslations("bill");
  const tg = await getTranslations("groups");
  const parts = moneyParts(b.total, b.currency, locale);
  return (
    <section className="flex flex-col gap-2 px-5 pt-1">
      <span className="text-[13px] text-muted-foreground">
        {formatDate(b.occurredOn, locale)}
        {b.group ? (
          <>
            {" · "}
            <Link href={`/groups/${b.group.id}`} className="underline underline-offset-2">
              {b.group.name}
            </Link>
          </>
        ) : null}
      </span>
      <h1 className="text-2xl font-extrabold tracking-[-0.03em]">{b.title}</h1>
      <div className="flex items-baseline gap-1 leading-none">
        <span className="text-2xl font-bold">{parts.symbol}</span>
        <span className="text-5xl font-extrabold num tracking-tighter">{parts.number}</span>
      </div>
      <span className="text-[13px] text-muted-foreground">
        {t("payer")}: <b className="font-semibold text-foreground">{b.payer.isMe ? tg("you") : b.payer.name}</b> ·{" "}
        {t(`modes.${b.splitMode as "EQUAL"}`)}
      </span>
    </section>
  );
}

async function Shares({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, b } = await billOf(id);
  const shares = await billShares(actor, id);
  const locale = await getLocale();
  const t = await getTranslations("bill");
  const tg = await getTranslations("groups");
  const td = await getTranslations("debt");
  return (
    <section className="px-5 pt-6">
      <h2 className="pb-1 text-base font-bold">{t("review")}</h2>
      <ul>
        {shares.map((s) => {
          const label = t(`shareStatus.${s.status === "INFO" ? "PENDING" : s.status}`);
          const row = (
            <div className="flex items-center gap-3 py-3">
              <Initial name={s.name} className="size-9 text-sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">
                  {s.isMe ? `${s.name} (${tg("you")})` : s.name}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    s.status === "SETTLED" || s.status === "PAYER"
                      ? "text-pos"
                      : s.status === "REJECTED"
                        ? "text-neg"
                        : "text-muted-foreground",
                  )}
                >
                  {s.status === "INFO" ? t("infoOnly") : label}
                  {s.status === "ACTIVE" && s.remaining !== s.total
                    ? ` · ${td("remaining")} ${money(s.remaining, b.currency, locale)}`
                    : ""}
                </span>
              </div>
              <span
                className={cn("text-[15px] font-bold num", s.status === "VOID" && "text-muted-foreground line-through")}
              >
                {money(s.total, b.currency, locale)}
              </span>
            </div>
          );
          return (
            <li key={s.partyId} className="border-b border-line last:border-0">
              {s.obligationId ? <Link href={`/debts/${s.obligationId}`}>{row}</Link> : row}
            </li>
          );
        })}
      </ul>
      {shares.some((s) => s.status === "INFO") ? (
        <p className="pt-2 text-xs text-muted-foreground">
          {t("infoOnlyHint", { name: shares.find((s) => s.status === "INFO")!.name })}
        </p>
      ) : null}
    </section>
  );
}

async function Totals({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { b } = await billOf(id);
  const locale = await getLocale();
  const t = await getTranslations("bill");
  return (
    <dl className="flex flex-col gap-1 px-5 pt-5 text-[15px]">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t("subtotal")}</dt>
        <dd className="num">{money(b.subtotal, b.currency, locale)}</dd>
      </div>
      {b.discount ? (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t("discount")}</dt>
          <dd className="num">−{money(b.discount, b.currency, locale)}</dd>
        </div>
      ) : null}
      {b.service ? (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t("service")}</dt>
          <dd className="num">{money(b.service, b.currency, locale)}</dd>
        </div>
      ) : null}
      {b.tax ? (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">{t("tax")}</dt>
          <dd className="num">{money(b.tax, b.currency, locale)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between border-t border-line pt-2 font-bold">
        <dt>{t("total")}</dt>
        <dd className="num">{money(b.total, b.currency, locale)}</dd>
      </div>
    </dl>
  );
}

async function BillEvidence({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, b } = await billOf(id);
  const evidence = await listAttachments(actor, { type: "BILL", id });
  return <Evidence target={{ type: "BILL", id }} items={evidence} canAdd={b.isParty} />;
}

async function History({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor, b } = await billOf(id);
  const activity = await activityFor(actor, "BILL", id);
  const td = await getTranslations("debt");
  return (
    <section className="px-5 pt-6 pb-10">
      <h2 className="pb-1 text-base font-bold">{td("history")}</h2>
      <ActivityList items={activity} currency={b.currency} />
    </section>
  );
}

function SummarySkeleton() {
  const t = useTranslations("bill");
  return (
    <section className="flex flex-col gap-2 px-5 pt-1" aria-busy>
      <span className="text-[13px] text-muted-foreground">
        <SkeletonText w="18ch" />
      </span>
      <h1 className="text-2xl font-extrabold tracking-[-0.03em]">
        <SkeletonText w="7em" />
      </h1>
      <BigAmountSkeleton size="md" />
      <span className="text-[13px] text-muted-foreground">
        {t("payer")}:{" "}
        <b className="font-semibold text-foreground">
          <SkeletonText w="6ch" />
        </b>{" "}
        · <SkeletonText w="9ch" />
      </span>
    </section>
  );
}

function SharesSkeleton() {
  const t = useTranslations("bill");
  return (
    <section className="px-5 pt-6" aria-busy>
      <h2 className="pb-1 text-base font-bold">{t("review")}</h2>
      <ul>
        {["9ch", "12ch", "7ch"].map((w) => (
          <li key={w} className="border-b border-line last:border-0">
            <div className="flex items-center gap-3 py-3">
              <InitialSkeleton className="size-9" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">
                  <SkeletonText w={w} />
                </span>
                <span className="text-xs text-muted-foreground">
                  <SkeletonText w="10ch" />
                </span>
              </div>
              <span className="text-[15px] font-bold num">
                <SkeletonText w="6ch" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TotalsSkeleton() {
  const t = useTranslations("bill");
  return (
    <dl className="flex flex-col gap-1 px-5 pt-5 text-[15px]" aria-busy>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">{t("subtotal")}</dt>
        <dd className="num">
          <SkeletonText w="8ch" />
        </dd>
      </div>
      <div className="flex justify-between border-t border-line pt-2 font-bold">
        <dt>{t("total")}</dt>
        <dd className="num">
          <SkeletonText w="8ch" />
        </dd>
      </div>
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
