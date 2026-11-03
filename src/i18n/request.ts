import * as rootParams from "next/root-params";
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { messagesFor } from "@/i18n/messages";
import { routing } from "@/i18n/routing";

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    const paramValue = await rootParams.locale();

    locale = hasLocale(routing.locales, paramValue) ? paramValue : routing.defaultLocale;
  }
  return {
    locale,
    messages: messagesFor(locale),

    timeZone: "Asia/Jakarta",
  };
});
