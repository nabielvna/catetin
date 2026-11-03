import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { LOCALE_COOKIE, routing } from "@/i18n/routing";
import { isGuestOnlyPath, isProtectedPath } from "@/lib/route-access";
import { safeNextPath } from "@/lib/safe-next";
import { log } from "@/lib/server/logger";
import { auth } from "@/services/auth";

const intl = createIntlMiddleware(routing);

function stripLocale(pathname: string): { locale: string | null; path: string } {
  for (const l of routing.locales) {
    if (pathname === `/${l}`) return { locale: l, path: "/" };
    if (pathname.startsWith(`/${l}/`)) return { locale: l, path: pathname.slice(l.length + 1) };
  }
  return { locale: null, path: pathname };
}

type SessionUser = { locale: string; onboardedAt: Date | string | null | undefined };
type SessionCheck = { user: SessionUser | null; setCookies: string[] };

async function readSession(req: NextRequest, fresh = false): Promise<SessionCheck | "error"> {
  if (!getSessionCookie(req)) return { user: null, setCookies: [] };
  try {
    const { headers, response } = await auth().api.getSession({
      headers: req.headers,
      query: fresh ? { disableCookieCache: true } : undefined,
      returnHeaders: true,
    });
    const u = response?.user;

    const user = u ? { locale: u.locale === "en" ? "en" : "id", onboardedAt: u.onboardedAt } : null;
    return { user, setCookies: headers.getSetCookie() };
  } catch (err) {
    log.error({ err }, "proxy session check failed");
    return "error";
  }
}

function withCookies(res: NextResponse, setCookies: string[]): NextResponse {
  for (const c of setCookies) res.headers.append("set-cookie", c);
  return res;
}

function redirectTo(req: NextRequest, prefix: string, pathAndQuery: string, setCookies: string[]): NextResponse {
  const target = new URL(`${prefix}${pathAndQuery}`, req.nextUrl);
  return withCookies(NextResponse.redirect(target), setCookies);
}

export default async function proxy(req: NextRequest) {
  const { locale, path } = stripLocale(req.nextUrl.pathname);
  const prefix = locale && locale !== routing.defaultLocale ? `/${locale}` : "";
  const isProtected = isProtectedPath(path);
  const isGuestOnly = isGuestOnlyPath(path);
  if (!isProtected && !isGuestOnly) return intl(req);

  let check = await readSession(req);

  if (check === "error") return intl(req);
  const here = path + req.nextUrl.search;

  if (!check.user) {
    if (isProtected) return redirectTo(req, prefix, `/login?next=${encodeURIComponent(here)}`, check.setCookies);
    return withCookies(intl(req), check.setCookies);
  }
  if (isGuestOnly) {
    if (req.nextUrl.searchParams.has("next")) return withCookies(intl(req), check.setCookies);
    return redirectTo(req, prefix, "/home", check.setCookies);
  }

  if (path === "/onboarding") {
    if (!check.user.onboardedAt) return withCookies(intl(req), check.setCookies);
    return redirectTo(req, "", safeNextPath(req.nextUrl.searchParams.get("next")), check.setCookies);
  }

  const cookieLocale = req.cookies.get(LOCALE_COOKIE.name)?.value;
  const needsRoute = (u: SessionUser) => !u.onboardedAt || (!locale && cookieLocale !== u.locale);
  if (needsRoute(check.user)) {
    const fresh = await readSession(req, true);
    if (fresh !== "error") check = fresh;
    if (!check.user) return redirectTo(req, prefix, `/login?next=${encodeURIComponent(here)}`, check.setCookies);
    if (!check.user.onboardedAt) {
      return redirectTo(req, prefix, `/onboarding?next=${encodeURIComponent(here)}`, check.setCookies);
    }
    if (needsRoute(check.user)) {
      const q = new URLSearchParams({ to: check.user.locale, next: here });
      return redirectTo(req, "", `/api/locale?${q}`, check.setCookies);
    }
  }
  return withCookies(intl(req), check.setCookies);
}

export const config = { matcher: "/((?!api|_next|_vercel|sw.js|.*\\..*).*)" };
