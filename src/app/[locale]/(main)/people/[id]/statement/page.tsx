import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PrintButton } from "@/app/[locale]/(main)/people/[id]/statement/print-button";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { statementRows } from "@/domain/statement";
import { formatDate, money } from "@/lib/format";
import { isUuid } from "@/lib/server/ids";
import { requireActorPage } from "@/services/page-access";
import { getPerson } from "@/services/people/queries";

export default function StatementPage(props: PageProps<"/[locale]/people/[id]/statement">) {
  return (
    <Suspense>
      <Resolve value={props.params}>{({ id: partyId }) => <Content partyId={partyId} />}</Resolve>
    </Suspense>
  );
}

async function Content({ partyId }: { partyId: string }) {
  "use cache: private";
  cacheLife("session");
  if (!isUuid(partyId)) notFound();
  const actor = await requireActorPage(`/people/${partyId}/statement`);
  const data = await getPerson(actor, partyId);
  if (!data) notFound();
  const locale = await getLocale();
  const t = await getTranslations("person");
  const td = await getTranslations("debt");
  const tp = await getTranslations("payment");
  const tm = await getTranslations("money");

  const withBalance = statementRows(data.entries);

  return (
    <>
      <div className="no-print">
        <PageHeader
          fallbackHref={`/people/${partyId}`}
          action={
            <PrintButton
              label={t("print")}
              pdfLabel={t("downloadPdf")}
              pdfHref={`/api/export/person/${partyId}/pdf`}
              shareTitle={data.header.name}
            />
          }
        />
      </div>
      <article className="px-5 pb-10 print:px-0">
        <header className="flex flex-col gap-1 pb-4">
          <span className="text-lg font-extrabold tracking-[-0.04em]">catetin</span>
          <h1 className="text-2xl font-bold">{data.header.name}</h1>
          <span className="text-[13px] text-muted-foreground">
            {actor.name} · {formatDate(new Date().toISOString().slice(0, 10), locale)}
          </span>
        </header>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-foreground text-left">
              <th className="py-2 pr-2 font-semibold">{td("date")}</th>
              <th className="py-2 pr-2 font-semibold">{td("title")}</th>
              <th className="py-2 pr-2 text-right font-semibold">{td("amount")}</th>
              <th className="py-2 text-right font-semibold">{t("balance")}</th>
            </tr>
          </thead>
          <tbody>
            {withBalance.map((e) => (
              <tr key={`${e.kind}:${e.id}`} className="border-b border-line align-top">
                <td className="py-2 pr-2 whitespace-nowrap">
                  {formatDate(e.date, locale, { day: "numeric", month: "short", year: "2-digit" })}
                </td>
                <td className="py-2 pr-2">
                  {e.kind === "OBLIGATION"
                    ? e.title
                    : `${tp(`kind.${e.settlementKind ?? "PAYMENT"}`)}${e.title ? ` — ${e.title}` : ""}`}
                  {e.groupName ? <span className="text-muted-foreground"> · {e.groupName}</span> : null}
                </td>
                <td className="py-2 pr-2 text-right num whitespace-nowrap">
                  {e.delta === 0 ? "—" : money(e.delta, e.currency, locale, "always")}
                </td>
                <td className="py-2 text-right font-semibold num whitespace-nowrap">
                  {money(e.balance, e.currency, locale, "always")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="pt-4 text-[13px]">
          {Object.entries(data.header.net).length === 0
            ? tm("allSettled")
            : Object.entries(data.header.net)
                .map(
                  ([c, v]) =>
                    (v! > 0
                      ? tm("theyOweYou", { name: data.header.name })
                      : tm("youOweThem", { name: data.header.name })) + ` ${money(Math.abs(v!), c, locale)}`,
                )
                .join(" · ")}
        </p>
      </article>
    </>
  );
}
