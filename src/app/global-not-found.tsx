import "@/app/globals.css";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeProvider } from "next-themes";
import { Suspense } from "react";

import { geist, geistMono } from "@/app/fonts";
import { NotFoundView } from "@/components/layout/not-found-view";
import { messagesFor } from "@/i18n/messages";
import { LOCALE_COOKIE } from "@/i18n/routing";

export const metadata: Metadata = { title: "404 · Catetin" };

export default function GlobalNotFound() {
  return (
    <html lang="id" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Suspense>
            <Content />
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}

async function Content() {
  const locale = (await cookies()).get(LOCALE_COOKIE.name)?.value === "en" ? "en" : "id";
  const m = messagesFor(locale);
  return (
    <div lang={locale}>
      <NotFoundView title={m.errors.notFoundTitle} body={m.errors.notFoundBody} home={m.nav.home} />
    </div>
  );
}
