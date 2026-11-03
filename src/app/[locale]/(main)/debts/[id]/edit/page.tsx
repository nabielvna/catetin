import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { EditDebtForm } from "@/app/[locale]/(main)/debts/[id]/edit/edit-form";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { todayIn } from "@/domain/dates";
import { isUuid } from "@/lib/server/ids";
import { getObligationDetail } from "@/services/debts/queries";
import { requireActorPage } from "@/services/page-access";

export default async function EditDebtPage(props: PageProps<"/[locale]/debts/[id]/edit">) {
  const tc = await getTranslations("common");
  return (
    <>
      <PageHeader title={tc("edit")} />
      <Suspense>
        <Resolve value={props.params}>{({ id }) => <Content id={id} />}</Resolve>
      </Suspense>
    </>
  );
}

async function Content({ id }: { id: string }) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(id)) notFound();
  const actor = await requireActorPage(`/debts/${id}/edit`);
  const d = await getObligationDetail(actor, id);
  if (!d || d.readOnly || (d.status !== "ACTIVE" && !(d.status === "PENDING" && d.iCreated))) notFound();
  return (
    <EditDebtForm
      debt={{
        id: d.id,
        amount: d.amount,
        currency: d.currency,
        title: d.title,
        note: d.note,
        category: d.category,
        occurredOn: d.occurredOn,
        dueOn: d.installments ? null : d.dueOn,
        installments: d.installments?.plan ?? null,
        hasItems: d.items.length > 0,
        minAmount: d.paid + d.reserved,
        iAmCreditor: d.iAmCreditor,
        counterpartName: d.counterpart.name.split(" ")[0] ?? d.counterpart.name,
        pending: d.status === "PENDING",
      }}
      today={todayIn(actor.timezone, new Date())}
    />
  );
}
