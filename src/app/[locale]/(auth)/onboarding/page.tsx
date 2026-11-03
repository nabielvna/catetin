import { cacheLife } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { OnboardingForm } from "@/app/[locale]/(auth)/onboarding/onboarding-form";
import { Logo } from "@/components/layout/logo";
import { Cover } from "@/components/records/record-parts";
import { safeNextPath } from "@/lib/safe-next";
import { onboardingState } from "@/services/account/profile";
import { requireActorPage } from "@/services/page-access";

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  "use cache: private";
  cacheLife("session");
  const { next } = await searchParams;
  const target = safeNextPath(next);
  const actor = await requireActorPage(`/onboarding?next=${encodeURIComponent(target)}`, { allowNotOnboarded: true });
  const p = await onboardingState(actor);
  if (p?.onboardedAt) redirect(target);

  return <OnboardingForm name={p?.accountName?.trim() ? actor.name : ""} next={target} />;
}

export default async function OnboardingPage(props: PageProps<"/[locale]/onboarding">) {
  const t = await getTranslations("onboarding");
  return (
    <Cover>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe">
        <header className="flex h-16 items-center">
          <Logo />
        </header>
        <div className="flex flex-1 flex-col gap-8 py-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.035em]">{t("title")}</h1>
            <p className="text-[15px] text-muted-foreground">{t("sub")}</p>
          </div>
          <Suspense fallback={<div className="h-80 animate-pulse rounded-lg bg-soft" />}>
            <Content searchParams={props.searchParams as Promise<{ next?: string }>} />
          </Suspense>
        </div>
      </main>
    </Cover>
  );
}
