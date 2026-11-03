import { Suspense } from "react";

import { LazyAssistant } from "@/components/assistant/lazy-assistant";
import { BottomNav, NavShell } from "@/components/layout/bottom-nav";
import { InboxBadge } from "@/components/layout/inbox-badge";
import { NewSheet } from "@/components/layout/new-sheet";
import { RealtimeRefresher } from "@/components/layout/realtime";
import { PushSync } from "@/components/pwa/push-sync";
import { TourHost } from "@/components/tour/tour-provider";
import { getActor } from "@/services/auth";
import { inboxCounts } from "@/services/notifications/inbox";

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col pb-[calc(68px+env(safe-area-inset-bottom))]">
      <main className="flex flex-1 flex-col">{children}</main>
      <Suspense fallback={<NavShell pathname={null} />}>
        <BottomNav
          badge={
            <Suspense fallback={null}>
              <UserInboxBadge />
            </Suspense>
          }
        />
      </Suspense>
      <NewSheet />
      <RealtimeRefresher />
      <PushSync />
      <Suspense fallback={null}>
        <LazyAssistant />
      </Suspense>
      <Suspense fallback={null}>
        <TourHost />
      </Suspense>
    </div>
  );
}

async function UserInboxBadge() {
  const actor = await getActor();
  if (!actor) return null;
  return <InboxBadge {...await inboxCounts(actor)} />;
}
