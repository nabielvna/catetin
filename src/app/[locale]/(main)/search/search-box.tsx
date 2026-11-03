"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";

export function SearchBox({ initial }: { initial: string }) {
  const t = useTranslations("search");
  const router = useRouter();
  const [q, setQ] = useState(initial);
  useEffect(() => {
    if (q === initial) return;
    const id = setTimeout(() => router.replace(`/search?q=${encodeURIComponent(q)}`, { scroll: false }), 250);
    return () => clearTimeout(id);
  }, [q, initial, router]);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        data-tour="search.input"
        autoFocus
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("placeholder")}
        className="h-11 border-transparent bg-soft pl-9"
        aria-label={t("placeholder")}
      />
    </div>
  );
}
