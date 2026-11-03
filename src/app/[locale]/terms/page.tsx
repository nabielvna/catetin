import { getLocale } from "next-intl/server";

import { LegalPage } from "@/components/layout/legal-page";
import { messagesFor } from "@/i18n/messages";

export default async function LegalDocument() {
  return <LegalPage {...messagesFor(await getLocale()).legal.terms} />;
}
