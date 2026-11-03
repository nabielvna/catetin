import { cacheLife } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { SearchBox } from "@/app/[locale]/(main)/search/search-box";
import { PageHeader } from "@/components/layout/page-header";
import { Resolve } from "@/components/layout/resolve";
import { Amount, DateBlock, Initial } from "@/components/records/record-parts";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { listLabels } from "@/services/labels";
import { requireActorPage } from "@/services/page-access";
import { search } from "@/services/search";

export default async function SearchPage(props: PageProps<"/[locale]/search">) {
  const t = await getTranslations("common");
  return (
    <>
      <PageHeader title={t("search")} />
      <Suspense>
        <Resolve value={props.searchParams}>{(sp) => <Content sp={sp} />}</Resolve>
      </Suspense>
    </>
  );
}

async function Content({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  "use cache: private";
  cacheLife("session");
  const q = typeof sp.q === "string" ? sp.q : "";
  const label = typeof sp.label === "string" ? sp.label : null;
  const actor = await requireActorPage("/search");
  const [r, labels] = await Promise.all([search(actor, q, label), listLabels(actor.userId)]);
  const tl = await getTranslations("labels");
  const locale = await getLocale();
  const t = await getTranslations("search");
  const empty = (label || q.trim().length >= 2) && r.people.length + r.groups.length + r.debts.length === 0;
  return (
    <div className="flex flex-col px-5 pb-10">
      <SearchBox initial={q} />
      {labels.length > 0 ? (
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pt-3" aria-label={tl("filter")}>
          {labels.map((l) => {
            const on = label?.toLowerCase() === l.name.toLowerCase();
            return (
              <Link
                key={l.id}
                href={on ? "/search" : `/search?label=${encodeURIComponent(l.name)}`}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex h-8 shrink-0 items-center rounded-full border px-3 text-[13px] font-semibold",
                  on ? "border-foreground bg-foreground text-background" : "border-border",
                )}
              >
                #{l.name}
                <span className={cn("ml-1 font-medium", on ? "opacity-70" : "text-muted-foreground")}>{l.count}</span>
              </Link>
            );
          })}
        </div>
      ) : null}
      {empty ? <p className="py-6 text-sm text-muted-foreground">{t("none", { q: label ? `#${label}` : q })}</p> : null}
      {r.people.length > 0 ? (
        <>
          <h2 className="pt-5 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {t("people")}
          </h2>
          <ul>
            {r.people.map((p) => (
              <li key={p.partyId} className="border-b border-line last:border-0">
                <Link href={`/people/${p.partyId}`} className="flex items-center gap-3 py-2.5">
                  <Initial name={p.name} className="size-9 text-sm" />
                  <span className="text-[15px] font-semibold">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {r.groups.length > 0 ? (
        <>
          <h2 className="pt-5 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {t("groups")}
          </h2>
          <ul>
            {r.groups.map((g) => (
              <li key={g.id} className="border-b border-line last:border-0">
                <Link href={`/groups/${g.id}`} className="block py-3 text-[15px] font-semibold">
                  {g.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {r.debts.length > 0 ? (
        <>
          <h2 className="pt-5 pb-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
            {t("debts")}
          </h2>
          <ul>
            {r.debts.map((d) => (
              <li key={d.id} className="border-b border-line last:border-0">
                <Link href={`/debts/${d.id}`} className="flex items-center gap-3.5 py-3">
                  <DateBlock date={d.occurredOn} locale={locale} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] font-semibold">{d.title}</span>
                    <span className="truncate text-[13px] text-muted-foreground">{d.counterpart}</span>
                  </div>
                  <Amount
                    value={d.direction === "THEY_OWE" ? d.amount : -d.amount}
                    currency={d.currency}
                    locale={locale}
                    tone={d.status === "ACTIVE" ? undefined : "muted"}
                    className="text-[15px]"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
