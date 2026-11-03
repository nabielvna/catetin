import { Search } from "lucide-react";
import { cacheLife } from "next/cache";
import { cookies, headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { BalanceSkeleton } from "@/app/[locale]/(main)/home/balance-summary";
import { Balance } from "@/app/[locale]/(main)/home/balance-summary";
import { anyOf } from "@/app/[locale]/(main)/home/balance-summary";
import { summaryOf } from "@/app/[locale]/(main)/home/balance-summary";
import { primaryView } from "@/app/[locale]/(main)/home/balance-summary";
import { HomeRecords, HomeRecordsSkeleton } from "@/app/[locale]/(main)/home/home-records";
import { AwaitingCarousel } from "@/components/approvals/awaiting-carousel";
import { AssistantButton } from "@/components/assistant/assistant-button";
import { Logo } from "@/components/layout/logo";
import { Nudges } from "@/components/pwa/nudges";
import { Amount, DateBlock, SectionTitle } from "@/components/records/record-parts";
import { diffDays, todayIn } from "@/domain/dates";
import { Link } from "@/i18n/navigation";
import { NUDGE_COOKIE, parseNudge } from "@/lib/nudge";
import { env } from "@/lib/server/env";
import { listAwaiting } from "@/services/approvals/queries";
import type { Actor } from "@/services/context";
import { dueSoon } from "@/services/home";
import { requireActorPage } from "@/services/page-access";
import { openRecords, recentEntries } from "@/services/records";
export default async function HomePage() {
  const t = await getTranslations("nav");
  return (
    <>
      <header className="flex items-center justify-between pt-safe pr-2 pl-5">
        <div className="flex h-14 items-center">
          <Logo />
        </div>
        <div className="flex items-center">
          <AssistantButton />
          <Link
            href="/search"
            aria-label={t("search")}
            data-tour="home.search"
            className="flex size-11 items-center justify-center"
          >
            <Search className="size-5.5" strokeWidth={1.8} />
          </Link>
        </div>
      </header>
      <Suspense fallback={<BalanceSkeleton />}>
        <Balance />
      </Suspense>
      <Suspense>
        <Awaiting />
      </Suspense>
      <Suspense>
        <HomeNudges />
      </Suspense>
      <Suspense>
        <Due />
      </Suspense>
      <Suspense fallback={<HomeRecordsSkeleton />}>
        <Records />
      </Suspense>
    </>
  );
}

async function awaitingOf(actor: Actor) {
  "use cache: private";
  cacheLife("session");
  return listAwaiting(actor, 10);
}

async function Awaiting() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/home");
  const [awaiting, any] = await Promise.all([awaitingOf(actor), anyOf(actor)]);
  return any && awaiting.length > 0 ? <AwaitingCarousel items={awaiting} /> : null;
}

async function HomeNudges() {
  const actor = await requireActorPage("/home");
  const [summary, awaiting, any, jar, h] = await Promise.all([
    summaryOf(actor),
    awaitingOf(actor),
    anyOf(actor),
    cookies(),
    headers(),
  ]);
  if (!any) return null;
  const { owed, owe } = primaryView(actor, summary);
  const hasRecords = owed + owe > 0 || awaiting.length > 0;
  const remembered = parseNudge(jar.get(NUDGE_COOKIE)?.value);
  return (
    <Nudges
      initial={remembered === "push" && !hasRecords ? null : remembered}
      ios={/iphone|ipad/i.test(h.get("user-agent") ?? "")}
      hasRecords={hasRecords}
      vapidPublicKey={env().VAPID_PUBLIC_KEY ?? null}
    />
  );
}

async function Due() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/home");
  const [due, any] = await Promise.all([dueSoon(actor), anyOf(actor)]);
  if (!any || due.length === 0) return null;
  const locale = await getLocale();
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const today = todayIn(actor.timezone, new Date());

  return (
    <section className="flex flex-col px-5 pt-7">
      <SectionTitle title={t("due")} aside={t("next7")} />
      <ul>
        {due.map((d) => {
          const days = diffDays(today, d.dueOn);
          const label = days < 0 ? t("overdue") : days === 0 ? tc("today") : days === 1 ? tc("tomorrow") : null;
          return (
            <li key={d.obligationId} className="border-b border-line last:border-0">
              <Link href={`/debts/${d.obligationId}`} className="flex items-center gap-3.5 py-3">
                <DateBlock date={d.dueOn} locale={locale} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15px] font-semibold">{d.groupName ?? d.counterpartName}</span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {d.title}
                    {d.groupName
                      ? ` · ${d.direction === "I_OWE" ? t("toPerson", { name: d.counterpartName }) : d.counterpartName}`
                      : ""}
                    {label ? (
                      <>
                        {" · "}
                        <b className="font-semibold text-neg">{label}</b>
                      </>
                    ) : null}
                  </span>
                </div>
                <Amount
                  value={d.direction === "THEY_OWE" ? d.remaining : -d.remaining}
                  currency={d.currency}
                  locale={locale}
                  className="text-[15px]"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function Records() {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/home");
  const [open, recent] = await Promise.all([openRecords(actor), recentEntries(actor)]);
  if (open.rows.length === 0 && recent.length === 0) return null;
  return <HomeRecords open={open} recent={recent} />;
}
