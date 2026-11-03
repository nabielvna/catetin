import { getTranslations } from "next-intl/server";

import { AddPersonForm } from "@/app/[locale]/(main)/people/new/add-person-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function AddPersonPage() {
  const t = await getTranslations("addPerson");
  return (
    <>
      <PageHeader title={t("title")} fallbackHref="/people" />
      <AddPersonForm />
    </>
  );
}
