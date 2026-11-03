import { defineRouting } from "next-intl/routing";

export const LOCALE_COOKIE = { name: "NEXT_LOCALE", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 } as const;

export const routing = defineRouting({
  locales: ["id", "en"],
  defaultLocale: "id",

  localePrefix: "never",

  localeDetection: true,
  localeCookie: LOCALE_COOKIE,
});

export type AppLocale = (typeof routing.locales)[number];
