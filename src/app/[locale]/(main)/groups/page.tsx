import { Plus } from "lucide-react";
import { cacheLife } from "next/cache";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { GroupInvitation } from "@/app/[locale]/(main)/groups/group-invitation";
import { PeopleTabs } from "@/components/people/people-tabs";
import { Amount, EmptyState } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import type { Currency } from "@/domain/money";
import { Link } from "@/i18n/navigation";
import { type GroupListItem, listMyGroups } from "@/services/groups/queries";
import { requireActorPage } from "@/services/page-access";

export default async function GroupsPage() {
  const t = await getTranslations("groups");
  return (
    <>
      <PeopleTabs
        active="groups"
        action={
          <Link
            href="/groups/new"
            aria-label={t("new")}
            data-tour="groups.new"
            className="flex size-11 items-center justify-center rounded-md hover:bg-soft"
          >
            <Plus className="size-6" strokeWidth={1.8} />
          </Link>
        }
      />
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/groups");
  const groups = await listMyGroups(actor);
  const t = await getTranslations("groups");
  const locale = await getLocale();
  const invites = groups.filter((g) => g.myStatus === "INVITED");
  const mine = groups.filter((g) => g.myStatus !== "INVITED" && !g.archived);
  const active = mine.filter((g) => g.openCount > 0 || g.recent);
  const finished = mine.filter((g) => !active.includes(g));

  if (groups.length === 0) {
    return (
      <div className="px-5">
        <EmptyState body={t("empty")}>
          <Button asChild>
            <Link href="/groups/new">{t("new")}</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const row = (g: GroupListItem) => {
    const entries = Object.entries(g.net) as Array<[Currency, number]>;
    const main = entries.find(([c]) => c === actor.currency) ?? entries[0];
    return (
      <li key={g.id} className="border-b border-line last:border-0">
        <Link href={`/groups/${g.id}`} className="flex items-center gap-3 py-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-soft text-[15px] font-bold"
            aria-hidden
          >
            {g.name.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-semibold">{g.name}</span>
            <span className="truncate text-[13px] text-muted-foreground">
              {g.memberCount} · {t(`modes.${g.mode}`)}
              {g.myStatus === "PENDING" ? ` · ${t("pendingApproval")}` : ""}
            </span>
          </div>
          {main ? <Amount value={main[1]} currency={main[0]} locale={locale} className="text-[15px]" /> : null}
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-2 px-5 pb-8">
      {invites.map((g) => (
        <GroupInvitation key={g.id} group={{ id: g.id, name: g.name, mode: g.mode, invitedBy: g.invitedBy }} />
      ))}
      {active.length > 0 ? (
        <>
          <h2 className="pt-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {t("active")}
          </h2>
          <ul>{active.map(row)}</ul>
        </>
      ) : null}
      {finished.length > 0 ? (
        <>
          <h2 className="pt-5 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {t("finished")}
          </h2>
          <ul>{finished.map(row)}</ul>
        </>
      ) : null}
    </div>
  );
}

function ListSkeleton() {
  const t = useTranslations("groups");
  return (
    <div className="flex flex-col gap-2 px-5 pb-8" aria-busy>
      <h2 className="pt-3 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t("active")}</h2>
      <ul>
        {["9ch", "13ch", "7ch"].map((w) => (
          <li key={w} className="border-b border-line last:border-0">
            <div className="flex items-center gap-3 py-3">
              <Skeleton className="size-11 shrink-0 rounded-md" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold">
                  <SkeletonText w={w} />
                </span>
                <span className="truncate text-[13px] text-muted-foreground">
                  <SkeletonText w="14ch" />
                </span>
              </div>
              <span className="text-[15px] font-bold num whitespace-nowrap">
                <SkeletonText w="6ch" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
