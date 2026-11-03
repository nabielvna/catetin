import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { userTag } from "@/lib/server/cache-tags";
import { getActor } from "@/services/auth";
import type { Actor } from "@/services/context";

export async function requireActorPage(next?: string, opts: { allowNotOnboarded?: boolean } = {}): Promise<Actor> {
  "use cache: private";
  cacheLife("session");
  const actor = await getActor();
  if (!actor) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  cacheTag(userTag(actor.userId));
  if (!actor.onboarded && !opts.allowNotOnboarded) {
    redirect(next ? `/onboarding?next=${encodeURIComponent(next)}` : "/onboarding");
  }

  if (actor.onboarded && next && (await getLocale()) !== actor.locale) {
    redirect(`/api/locale?to=${actor.locale}&next=${encodeURIComponent(next)}`);
  }
  return actor;
}
