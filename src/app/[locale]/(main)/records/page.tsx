import { getLocale } from "next-intl/server";

import { parseRecordFilter, recordFilterQuery } from "@/domain/records";
import { redirect } from "@/i18n/navigation";
export default async function RecordsPage(props: PageProps<"/[locale]/records">) {
  const locale = await getLocale();
  const query = recordFilterQuery(parseRecordFilter(await props.searchParams));
  redirect({ href: `/debts${query}`, locale });
}
