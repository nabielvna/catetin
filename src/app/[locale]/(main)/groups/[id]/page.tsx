import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { EntriesSkeleton, GroupMenu, GroupTabs } from "@/app/[locale]/(main)/groups/[id]/group-client";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { BigAmountSkeleton, UnderlineTabsSkeleton } from "@/components/layout/skeletons";
import { Button, buttonVariants } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton";
import { type Currency, nonZeroEntries } from "@/domain/money";
import { Link } from "@/i18n/navigation";
import { money, moneyParts } from "@/lib/format";
import { isUuid } from "@/lib/server/ids";
import { cn } from "@/lib/utils";
import { canSeeGroup, getGroupDetail, groupEntries } from "@/services/groups/queries";
import { simplifyPreview } from "@/services/groups/simplify";
import { requireActorPage } from "@/services/page-access";
import { pickablePeople } from "@/services/people/queries";

export default function GroupPage(props: PageProps<"/[locale]/groups/[id]">) {
  const { params } = props;
  return (
    <>
      <Suspense fallback={<PageHeader fallbackHref="/groups" />}>
        <Resolve value={params}>{({ id }) => <Header id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<SummarySkeleton />}>
        <Resolve value={params}>{({ id }) => <Summary id={id} />}</Resolve>
      </Suspense>
      <Suspense fallback={<TabsSkeleton />}>
        <Resolve value={params}>{({ id }) => <Tabs id={id} />}</Resolve>
      </Suspense>
    </>
  );
}

async function load(id: string) {
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/groups/${id}`);
  return { actor, id };
}

async function groupOf(id: string) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/groups/${id}`);
  const g = await getGroupDetail(actor, id);
  if (!g) notFound();
  return { actor, id, g };
}

async function Header({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { g } = await groupOf(id);
  return <PageHeader fallbackHref="/groups" action={<GroupMenu group={g} />} />;
}

async function Summary({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { g } = await groupOf(id);
  const locale = await getLocale();
  const t = await getTranslations("groups");
  const tm = await getTranslations("money");
  const me = g.members.find((m) => m.isMe)!;
  const net = nonZeroEntries(me.net);
  const primary: Currency =
    me.net[g.currency as Currency] !== undefined || net.length === 0 ? (g.currency as Currency) : net[0]![0];
  const myNet = me.net[primary] ?? 0;
  const parts = moneyParts(myNet, primary, locale);

  return (
    <section className="flex flex-col gap-4 px-5 pt-1">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-extrabold tracking-[-0.03em]">{g.name}</h1>
        <span className="text-[13px] text-muted-foreground">
          {g.members.filter((m) => m.status === "ACTIVE").length} · {t(`modes.${g.mode}`)}
          {g.pendingModeChange ? ` → ${t(`modes.${g.pendingModeChange.mode as "TRUST"}`)}?` : ""}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span
          className={`text-[13px] font-medium ${myNet > 0 ? "text-pos" : myNet < 0 ? "text-neg" : "text-muted-foreground"}`}
        >
          {t("balanceMine")}
        </span>
        <div className="flex items-baseline gap-1 leading-none">
          <span className="text-2xl font-bold">
            {myNet > 0 ? "+" : myNet < 0 ? "−" : ""}
            {parts.symbol}
          </span>
          <span className="text-5xl font-extrabold num tracking-tighter">{parts.number}</span>
        </div>
        {net.length > 1 ? (
          <span className="text-[13px] text-muted-foreground">
            +{" "}
            {net
              .filter(([c]) => c !== primary)
              .map(([c, v]) => money(v, c, locale, "always"))
              .join(", ")}
          </span>
        ) : myNet === 0 ? (
          <span className="text-[13px] text-muted-foreground">{tm("allSettled")}</span>
        ) : null}
      </div>
      {!g.archived ? (
        <div className="flex gap-2">
          <Button asChild className="flex-2">
            <Link href={`/bills/new?group=${g.id}`}>{t("expense")}</Link>
          </Button>
          {myNet < 0 ? (
            <Button asChild variant="outline" className="flex-1">
              <Link href="/payments/new">{t("settleUp")}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

async function Tabs({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  const { actor } = await load(id);
  if (!(await canSeeGroup(actor, id))) notFound();

  const entries = groupEntries(actor, id);
  const people = pickablePeople(actor);
  const simplify = simplifyPreview(actor, id);
  const g = await getGroupDetail(actor, id);
  if (!g) notFound();
  return <GroupTabs group={g} entries={entries} people={people} simplify={simplify} />;
}

function SummarySkeleton() {
  const t = useTranslations("groups");
  return (
    <section className="flex flex-col gap-4 px-5 pt-1" aria-busy>
      <div className="flex flex-col gap-0.5">
        <h1 className="text-2xl font-extrabold tracking-[-0.03em]">
          <SkeletonText w="6em" />
        </h1>
        <span className="text-[13px] text-muted-foreground">
          <SkeletonText w="14ch" />
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted-foreground">{t("balanceMine")}</span>
        <BigAmountSkeleton size="md" />
      </div>
      <div className="flex gap-2">
        <span className={cn(buttonVariants(), "flex-2")} aria-hidden>
          {t("expense")}
        </span>
      </div>
    </section>
  );
}

function TabsSkeleton() {
  const t = useTranslations("groups");
  return (
    <section className="mt-6" aria-busy>
      <UnderlineTabsSkeleton labels={[t("tabs.activity"), t("tabs.balances"), t("tabs.members")]} />
      <EntriesSkeleton />
    </section>
  );
}
