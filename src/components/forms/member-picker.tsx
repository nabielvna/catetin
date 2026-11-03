"use client";

import { Check, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { InitialSkeleton } from "@/components/layout/skeletons";
import { Initial } from "@/components/records/record-parts";
import { Input } from "@/components/ui/input";
import { SkeletonText } from "@/components/ui/skeleton";
import { matchesName } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { PickablePerson } from "@/services/people/queries";

export type MemberSelection = { ids: string[]; manual: Array<{ id: string; name: string }> };

export function MemberPicker({
  people,
  value,
  onChange,
  exclude = [],
}: {
  people: PickablePerson[];
  value: MemberSelection;
  onChange: (v: MemberSelection) => void;
  exclude?: string[];
}) {
  const t = useTranslations("debt");
  const tp = useTranslations("people");
  const tc = useTranslations("common");
  const [q, setQ] = useState("");
  const list = people.filter((p) => !exclude.includes(p.partyId) && matchesName(p.name, q));
  const toggle = (id: string) =>
    onChange({ ...value, ids: value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id] });
  const exact = people.some((p) => p.name.toLowerCase() === q.trim().toLowerCase());

  return (
    <div className="flex flex-col gap-2">
      {value.manual.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.manual.map((m) => (
            <span
              key={m.id}
              className="flex h-9 items-center gap-1.5 rounded-md bg-soft pr-1 pl-3 text-sm font-semibold"
            >
              {m.name}
              <button
                type="button"
                aria-label={tc("delete")}
                className="flex size-7 items-center justify-center"
                onClick={() => onChange({ ...value, manual: value.manual.filter((x) => x.id !== m.id) })}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("whoPlaceholder")} autoComplete="off" />
      <ul className="flex max-h-80 flex-col overflow-y-auto">
        {q.trim() && !exact ? (
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-soft"
              onClick={() => {
                onChange({ ...value, manual: [...value.manual, { id: uuidv7(), name: q.trim().slice(0, 60) }] });
                setQ("");
              }}
            >
              <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-border">
                <Plus className="size-4" />
              </span>
              <span className="text-[15px] font-semibold">{t("addNew", { name: q.trim() })}</span>
            </button>
          </li>
        ) : null}
        {list.map((p) => {
          const on = value.ids.includes(p.partyId);
          return (
            <li key={p.partyId}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-soft"
                onClick={() => toggle(p.partyId)}
              >
                <Initial
                  name={p.name}
                  className={`size-9 text-sm ${p.state === "USER" ? "" : "bg-soft text-foreground"}`}
                />
                <span className="flex-1 truncate text-[15px] font-medium">{p.name}</span>
                {p.state === "MANUAL" ? <span className="text-xs text-muted-foreground">{tp("manual")}</span> : null}
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-sm border",
                    on ? "border-foreground bg-foreground text-background" : "border-border",
                  )}
                >
                  {on ? <Check className="size-4" /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MemberPickerSkeleton({ rows = 4 }: { rows?: number }) {
  const t = useTranslations("debt");
  return (
    <div className="flex flex-col gap-2" aria-busy>
      <Input placeholder={t("whoPlaceholder")} readOnly tabIndex={-1} aria-hidden />
      <ul className="flex max-h-80 flex-col overflow-y-auto">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i}>
            <div className="flex w-full items-center gap-3 rounded-md px-1 py-2">
              <InitialSkeleton className="size-9" />
              <span className="flex-1 truncate text-[15px] font-medium">
                <SkeletonText w={i % 2 ? "8ch" : "11ch"} />
              </span>
              <span className="flex size-6 items-center justify-center rounded-sm border border-border" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
