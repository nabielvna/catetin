"use client";

import { Home, Inbox, Plus, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { useNewSheet } from "@/components/layout/new-sheet";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/home", key: "home", icon: Home },
  { href: "/people", key: "people", icon: Users, also: ["/groups"] },
  { href: "#new", key: "new", icon: Plus },
  { href: "/inbox", key: "inbox", icon: Inbox },
  { href: "/account", key: "account", icon: UserRound },
] as const;

export function BottomNav({ badge }: { badge?: React.ReactNode }) {
  const pathname = usePathname();
  return <NavShell pathname={pathname} badge={badge} />;
}

export function NavShell({ pathname, badge }: { pathname: string | null; badge?: React.ReactNode }) {
  const t = useTranslations("nav");
  const openNew = useNewSheet((s) => s.open);

  return (
    <nav
      aria-label={t("main")}
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-background/95 pb-safe backdrop-blur supports-backdrop-filter:bg-background/80"
    >
      <div className="mx-auto grid h-17 max-w-lg grid-cols-5 items-center px-2">
        {items.map((it) => {
          if (it.key === "new") {
            return (
              <div key={it.key} className="flex justify-center">
                <button
                  type="button"
                  aria-label={t("new")}
                  data-tour="nav.new"
                  onClick={openNew}
                  className="flex size-12 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-95"
                >
                  <Plus className="size-5.5" strokeWidth={2.4} />
                </button>
              </div>
            );
          }
          const active =
            pathname !== null &&
            (pathname === it.href ||
              pathname.startsWith(`${it.href}/`) ||
              ("also" in it && it.also.some((p) => pathname.startsWith(p))));
          const Icon = it.icon;
          return (
            <Link
              key={it.key}
              href={it.href}
              data-tour={`nav.${it.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-full flex-col items-center justify-center gap-0.75 text-[11px]",
                active ? "font-bold text-foreground" : "font-medium text-muted-foreground",
              )}
            >
              <Icon className="size-5.5" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
              <span>{t(it.key)}</span>
              {it.key === "inbox" ? badge : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
