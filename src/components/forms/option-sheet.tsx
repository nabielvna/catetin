"use client";

import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type Option<V extends string> = {
  value: V;
  label: string;
  hint?: string;

  aside?: string;

  keywords?: string;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function OptionSheet<V extends string>({
  open,
  onOpenChange,
  title,
  options,
  value,
  onSelect,
  searchable,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: Option<V>[];
  value: V;
  onSelect: (value: V) => void;
  searchable?: boolean;
  footer?: React.ReactNode;
}) {
  const t = useTranslations("common");
  const [query, setQuery] = useState("");

  const [edges, setEdges] = useState({ top: false, bottom: false });
  const listRef = useRef<HTMLUListElement>(null);
  const measure = () => {
    const el = listRef.current;
    if (!el) return;
    const top = el.scrollTop > 2;
    const bottom = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
  };
  const q = norm(query.trim());
  const list = useMemo(() => {
    if (!q) {
      const selected = options.find((o) => o.value === value);
      return selected && searchable ? [selected, ...options.filter((o) => o !== selected)] : options;
    }
    return options.filter((o) => norm(`${o.value} ${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`).includes(q));
  }, [options, q, value, searchable]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [open, list]);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <DrawerContent className={cn(searchable && "h-[85dvh]")} data-tour="option.sheet">
        <DrawerHeader className={cn(searchable && "pb-3")}>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        {searchable ? (
          <div className="px-4 pb-2">
            <label className="flex h-11 items-center gap-2.5 rounded-full border border-border/70 bg-[color-mix(in_srgb,var(--soft)_98%,black)] px-4 transition-colors focus-within:border-muted-foreground">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search")}
                aria-label={t("search")}
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
        ) : null}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 z-10 h-1.5 border-t border-border/40 bg-linear-to-b from-black/3 to-transparent transition-opacity dark:from-black/15",
              edges.top ? "opacity-100" : "opacity-0",
            )}
          />
          <ul
            className="flex flex-1 flex-col overflow-y-auto px-3 py-1"
            role="listbox"
            aria-label={title}
            onScroll={measure}
            ref={listRef}
          >
            {list.map((o) => {
              const selected = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onOpenChange(false);
                      setQuery("");
                      if (!selected) onSelect(o.value);
                    }}
                    className={cn(
                      "flex min-h-12 w-full items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-foreground/5",
                      selected && "bg-foreground/[0.07]",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("text-[15px]", selected ? "font-semibold" : "font-medium")}>{o.label}</span>
                      {o.hint ? <span className="truncate text-[13px] text-muted-foreground">{o.hint}</span> : null}
                    </span>
                    {o.aside ? (
                      <span className="shrink-0 text-right text-[13px] num text-muted-foreground">{o.aside}</span>
                    ) : null}
                    <Check className={cn("size-5 shrink-0", !selected && "invisible")} aria-hidden />
                  </button>
                </li>
              );
            })}
            {list.length === 0 ? (
              <li className="px-3 py-6 text-center text-[15px] text-muted-foreground">{t("noResults")}</li>
            ) : null}
          </ul>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1.5 border-b border-border/40 bg-linear-to-t from-black/3 to-transparent transition-opacity dark:from-black/15",
              edges.bottom ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
        {footer ? (
          <div className="shrink-0 px-5 py-4 text-xs leading-relaxed text-muted-foreground">{footer}</div>
        ) : (
          <div className="h-3 shrink-0" />
        )}
      </DrawerContent>
    </Drawer>
  );
}
