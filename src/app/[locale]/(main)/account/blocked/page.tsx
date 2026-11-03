import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { BlockedSkeleton, BlockedView } from "@/app/[locale]/(main)/account/blocked/blocked-view";
import { PageHeader } from "@/components/layout/page-header";
import { requireActorPage } from "@/services/page-access";
import { listBlocked } from "@/services/people/blocks";

export default async function BlockedPage() {
  const t = await getTranslations("account");
  return (
    <>
      <PageHeader title={t("blockedTitle")} fallbackHref="/account" />
      <Suspense fallback={<BlockedSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/account/blocked");
  return <BlockedView people={await listBlocked(actor)} />;
}
