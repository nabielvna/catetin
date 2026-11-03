import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AccountSkeleton, AccountView } from "@/app/[locale]/(main)/account/account-view";
import { AssistantButton } from "@/components/assistant/assistant-button";
import { env } from "@/lib/server/env";
import { listDevices } from "@/services/account/sessions";
import { getSettings } from "@/services/account/settings";
import { signInMethods } from "@/services/account/sign-in-methods";
import { currentSessionId } from "@/services/auth";
import { googleEnabled } from "@/services/auth";
import { requireActorPage } from "@/services/page-access";

export default async function AccountPage() {
  const t = await getTranslations("account");
  return (
    <>
      <header className="flex h-14 items-center justify-between pt-safe pr-2 pl-5">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">{t("title")}</h1>
        <AssistantButton />
      </header>
      <Suspense fallback={<AccountSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/account");
  const [settings, devices, methods] = await Promise.all([
    getSettings(actor),
    listDevices(actor, await currentSessionId()),
    signInMethods(actor),
  ]);
  return (
    <AccountView
      actor={{
        name: actor.name,
        email: actor.email,
        locale: actor.locale,
        currency: actor.currency,
        timezone: actor.timezone,
      }}
      deviceCount={devices.length}
      google={googleEnabled() ? { linkedAt: methods.google?.linkedAt ?? null } : null}
      quiet={{ start: settings.quietStart, end: settings.quietEnd }}
      vapidPublicKey={env().VAPID_PUBLIC_KEY ?? null}
    />
  );
}
