import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DebtForm, DebtFormSkeleton } from "@/app/[locale]/(main)/debts/debt-form";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { todayIn } from "@/domain/dates";
import { listMyGroups } from "@/services/groups/queries";
import { requireActorPage } from "@/services/page-access";
import { pickablePeople } from "@/services/people/queries";

export default async function NewDebtPage(props: PageProps<"/[locale]/debts/new">) {
  const t = await getTranslations("debt");
  return (
    <>
      <PageHeader title={t("newTitle")} />
      <Suspense
        fallback={
          <Suspense fallback={<DebtFormSkeleton />}>
            <Resolve value={props.searchParams}>
              {(sp) => <DebtFormSkeleton withPerson={sp.with !== undefined} />}
            </Resolve>
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
  const actor = await requireActorPage("/debts/new");
  const [people, groups] = await Promise.all([pickablePeople(actor), listMyGroups(actor)]);
  const withId = typeof sp.with === "string" ? sp.with : null;
  const groupId = typeof sp.group === "string" ? sp.group : null;
  return (
    <DebtForm
      people={people}
      groups={groups
        .filter((g) => g.myStatus === "ACTIVE" && !g.archived)
        .map((g) => ({ id: g.id, name: g.name, mode: g.mode }))}
      initialPartyId={withId}
      initialGroupId={groupId}
      currency={actor.currency}
      today={todayIn(actor.timezone, new Date())}
    />
  );
}
