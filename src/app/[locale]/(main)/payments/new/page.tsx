import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { OffsetForm } from "@/app/[locale]/(main)/payments/new/offset-form";
import { PaymentSkeleton } from "@/app/[locale]/(main)/payments/new/payment-skeleton";
import { PickPayee } from "@/app/[locale]/(main)/payments/new/pick-payee";
import { PaymentForm } from "@/app/[locale]/(main)/payments/payment-form";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { todayIn } from "@/domain/dates";
import type { Currency } from "@/domain/money";
import { isUuid } from "@/lib/server/ids";
import { requireActorPage } from "@/services/page-access";
import { paymentContext } from "@/services/payments/queries";
import { listPeople } from "@/services/people/queries";

export default async function NewPaymentPage(props: PageProps<"/[locale]/payments/new">) {
  const t = await getTranslations("payment");
  return (
    <>
      <PageHeader title={t("title")} />
      <Suspense
        fallback={
          <Suspense fallback={<PaymentSkeleton />}>
            <Resolve value={props.searchParams}>
              {(sp) => (
                <PaymentSkeleton
                  variant={
                    typeof sp.with !== "string" || !sp.with ? "pick" : sp.kind === "offset" ? "offset" : "payment"
                  }
                />
              )}
            </Resolve>
          </Suspense>
        }
      >
        <Resolve value={props.searchParams}>{(sp) => <Content sp={sp} />}</Resolve>
      </Suspense>
    </>
  );
}

async function Content({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  "use cache: private";
  cacheLife("session");
  const actor = await requireActorPage("/payments/new");
  const withId = typeof sp.with === "string" ? sp.with : null;
  if (!withId) {
    const people = (await listPeople(actor)).filter((p) => Object.keys(p.net).length > 0);
    return <PickPayee people={people} />;
  }
  if (!isUuid(withId)) notFound();
  const ctx = await paymentContext(actor, withId);
  if (!ctx) notFound();
  const today = todayIn(actor.timezone, new Date());
  if (sp.kind === "offset") {
    return (
      <OffsetForm
        ctx={ctx}
        today={today}
        currency={(typeof sp.currency === "string" ? sp.currency : actor.currency) as Currency}
      />
    );
  }
  return (
    <PaymentForm
      ctx={ctx}
      myPartyId={actor.partyId}
      today={today}
      initialDir={sp.dir === "out" ? "out" : sp.dir === "in" ? "in" : null}
      focusObligation={typeof sp.obligation === "string" ? sp.obligation : null}
      defaultCurrency={actor.currency}
    />
  );
}
