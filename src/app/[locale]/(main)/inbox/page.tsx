import { cacheLife } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { InboxSkeleton, InboxView } from "@/app/[locale]/(main)/inbox/inbox-view";
import { AssistantButton } from "@/components/assistant/assistant-button";
import { Resolve } from "@/components/layout/resolve";
import { listDisputable } from "@/services/approvals/disputes";
import { listAwaiting, listWaiting } from "@/services/approvals/queries";
import { listNotifications } from "@/services/notifications/inbox";
import { renderNotification } from "@/services/notifications/render";
import { requireActorPage } from "@/services/page-access";

export default async function InboxPage(props: PageProps<"/[locale]/inbox">) {
  const t = await getTranslations("inbox");
  return (
    <>
      <header className="flex h-14 items-center justify-between pt-safe pr-2 pl-5">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">{t("title")}</h1>
        <AssistantButton />
      </header>
      <Suspense
        fallback={
          <Suspense fallback={<InboxSkeleton />}>
            <Resolve value={props.searchParams}>
              {(sp) => <InboxSkeleton tab={sp.tab === "waiting" || sp.tab === "notifications" ? sp.tab : "action"} />}
            </Resolve>
          </Suspense>
        }
      >
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/inbox");
  const locale = (await getLocale()) === "en" ? "en" : "id";
  const [awaiting, waiting, notifications, disputable] = await Promise.all([
    listAwaiting(actor),
    listWaiting(actor),
    listNotifications(actor),
    listDisputable(actor),
  ]);
  const rendered = notifications.map((n) => ({ ...n, text: renderNotification(n.payload, locale) }));
  return <InboxView awaiting={awaiting} waiting={waiting} notifications={rendered} disputable={disputable} />;
}
