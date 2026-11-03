import { getTranslations } from "next-intl/server";

import { NotFoundView } from "@/components/layout/not-found-view";

export default async function NotFound() {
  const t = await getTranslations("errors");
  const nav = await getTranslations("nav");
  return <NotFoundView title={t("notFoundTitle")} body={t("notFoundBody")} home={nav("home")} />;
}
