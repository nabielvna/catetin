import { cacheLife } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { DevicesSkeleton, DevicesView } from "@/app/[locale]/(main)/account/sessions/sessions-view";
import { PageHeader } from "@/components/layout/page-header";
import { listDevices } from "@/services/account/sessions";
import { currentSessionId } from "@/services/auth";
import { requireActorPage } from "@/services/page-access";

export default async function DevicesPage() {
  const t = await getTranslations("account");
  return (
    <>
      <PageHeader title={t("devices")} fallbackHref="/account" />
      <Suspense fallback={<DevicesSkeleton />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/account/devices");
  const [devices, locale] = await Promise.all([listDevices(actor, await currentSessionId()), getLocale()]);

  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const withPlace = devices.map((d) => {
    let country: string | null = null;
    try {
      country = d.country ? (regions.of(d.country) ?? d.country) : null;
    } catch {
      country = d.country;
    }
    return { ...d, place: [d.city, country].filter(Boolean).join(", ") || null };
  });
  return <DevicesView devices={withPlace} timezone={actor.timezone} />;
}
