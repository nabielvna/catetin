import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { BillWizard, BillWizardSkeleton } from "@/app/[locale]/(main)/bills/bill-form";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { todayIn } from "@/domain/dates";
import { isUuid } from "@/lib/server/ids";
import { getGroupDetail } from "@/services/groups/queries";
import { requireActorPage } from "@/services/page-access";
import { pickablePeople } from "@/services/people/queries";

export default async function NewBillPage(props: PageProps<"/[locale]/bills/new">) {
  const t = await getTranslations("bill");
  return (
    <>
      <PageHeader title={t("newTitle")} />
      <Suspense
        fallback={
          <Suspense fallback={<BillWizardSkeleton />}>
            <Resolve value={props.searchParams}>
              {(sp) => <BillWizardSkeleton inGroup={sp.group !== undefined} />}
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
  const actor = await requireActorPage("/bills/new");
  const groupId = typeof sp.group === "string" && isUuid(sp.group) ? sp.group : null;
  const [people, group] = await Promise.all([pickablePeople(actor), groupId ? getGroupDetail(actor, groupId) : null]);
  return (
    <BillWizard
      me={{ partyId: actor.partyId, name: actor.name }}
      people={people}
      group={
        group
          ? {
              id: group.id,
              name: group.name,
              currency: group.currency,
              memberIds: group.members.filter((m) => m.status === "ACTIVE" && !m.isMe).map((m) => m.partyId),
            }
          : null
      }
      currency={group?.currency ?? actor.currency}
      today={todayIn(actor.timezone, new Date())}
    />
  );
}
