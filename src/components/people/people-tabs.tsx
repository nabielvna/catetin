import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export async function PeopleTabs({ active, action }: { active: "people" | "groups"; action?: React.ReactNode }) {
  const t = await getTranslations("people");
  const tabs = [
    { key: "people", href: "/people", label: t("tabPeople") },
    { key: "groups", href: "/groups", label: t("tabGroups") },
  ] as const;
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-safe">
      <nav className="flex h-14 items-center gap-5" aria-label={t("title")}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            data-tour={`people.tab.${tab.key}`}
            aria-current={active === tab.key ? "page" : undefined}
            className={cn(
              "text-[22px] font-extrabold tracking-[-0.03em] transition-colors",
              active === tab.key ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="-mr-3 flex items-center">{action}</div>
    </header>
  );
}
