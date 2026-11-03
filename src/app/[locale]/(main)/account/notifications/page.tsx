import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NotificationsView } from "@/app/[locale]/(main)/account/notification-settings";
import { NotificationsSkeleton } from "@/app/[locale]/(main)/account/notifications/notifications-view";
import { PageHeader } from "@/components/layout/page-header";
import { env } from "@/lib/server/env";
import { getSettings } from "@/services/account/settings";
import { requireActorPage } from "@/services/page-access";

export default async function NotificationSettingsPage() {
  const t = await getTranslations("account");
  return (
    <>
      <PageHeader title={t("notifications")} fallbackHref="/account" />
      <Suspense fallback={<NotificationsSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/account/notifications");
  const settings = await getSettings(actor);
  return <NotificationsView settings={settings} vapidPublicKey={env().VAPID_PUBLIC_KEY ?? null} />;
}
