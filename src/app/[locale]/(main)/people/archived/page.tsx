import { ChevronRight } from "lucide-react";
import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { InitialSkeleton } from "@/components/layout/skeletons";
import { EmptyState, Initial } from "@/components/records/record-parts";
import { SkeletonText } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireActorPage } from "@/services/page-access";
import { listArchivedPeople } from "@/services/people/queries";

export default async function ArchivedPeoplePage() {
  const t = await getTranslations("person");
  return (
    <>
      <PageHeader title={t("archive.listTitle")} fallbackHref="/people" />
      <Suspense fallback={<ListSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/people/archived");
  const t = await getTranslations("person");
  const people = await listArchivedPeople(actor);
  if (people.length === 0) {
    return (
      <div className="px-5">
        <EmptyState body={t("archive.empty")} />
      </div>
    );
  }
  return (
    <ul className="px-5">
      {people.map((p) => (
        <li key={p.partyId} className="border-b border-line last:border-0">
          <Link href={`/people/${p.partyId}`} className="flex items-center gap-3 py-3">
            <Initial name={p.name} className="bg-soft text-foreground" />
            <span className="flex-1 truncate text-[15px] font-semibold">{p.name}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <ul className="px-5" aria-busy>
      {["10ch", "7ch", "12ch"].map((w) => (
        <li key={w} className="border-b border-line last:border-0">
          <div className="flex items-center gap-3 py-3">
            <InitialSkeleton />
            <span className="flex-1 truncate text-[15px] font-semibold">
              <SkeletonText w={w} />
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </div>
        </li>
      ))}
    </ul>
  );
}
