import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { GroupForm, GroupFormSkeleton } from "@/app/[locale]/(main)/groups/group-form";
import { PageHeader } from "@/components/layout/page-header";
import { requireActorPage } from "@/services/page-access";
import { pickablePeople } from "@/services/people/queries";

export default async function NewGroupPage() {
  const t = await getTranslations("groups");
  return (
    <>
      <PageHeader title={t("new")} fallbackHref="/groups" />
      <Suspense fallback={<GroupFormSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/groups/new");
  const people = await pickablePeople(actor);
  return <GroupForm people={people} currency={actor.currency} />;
}
