import { type NextRequest, NextResponse } from "next/server";
import { hasLocale } from "next-intl";

import { getPathname } from "@/i18n/navigation";
import { LOCALE_COOKIE, routing } from "@/i18n/routing";
import { safeNextPath } from "@/lib/safe-next";

export function GET(req: NextRequest) {
  if (req.headers.has("rsc")) return new NextResponse(null, { status: 200 });
  const to = req.nextUrl.searchParams.get("to");
  const locale = hasLocale(routing.locales, to) ? to : routing.defaultLocale;
  const path = safeNextPath(req.nextUrl.searchParams.get("next"));

  const res = new NextResponse(null, { status: 307, headers: { Location: getPathname({ href: path, locale }) } });
  const { name, ...attrs } = LOCALE_COOKIE;
  res.cookies.set(name, locale, { ...attrs, path: "/" });
  return res;
}
