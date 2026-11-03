import { UserPlus } from "lucide-react";
import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PeopleList, PeopleListSkeleton } from "@/app/[locale]/(main)/people/people-list";
import { PeopleTabs } from "@/components/people/people-tabs";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/services/page-access";
import { listArchivedPeople, listPeople } from "@/services/people/queries";

export default async function PeoplePage() {
  const t = await getTranslations("people");
  return (
    <>
      <PeopleTabs
        active="people"
        action={
          <Link
            href="/people/new"
            aria-label={t("add")}
            data-tour="people.add"
            className="flex size-11 items-center justify-center rounded-md hover:bg-soft"
          >
            <UserPlus className="size-5.5" strokeWidth={1.8} />
          </Link>
        }
      />
      <Suspense fallback={<PeopleListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/people");
  const [people, archived] = await Promise.all([listPeople(actor), listArchivedPeople(actor)]);
  return <PeopleList people={people} primaryCurrency={actor.currency} archivedCount={archived.length} />;
}
