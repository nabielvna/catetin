"use client";

import { Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { InitialSkeleton } from "@/components/layout/skeletons";
import { Initial } from "@/components/records/record-parts";
import { Input } from "@/components/ui/input";
import { SkeletonText } from "@/components/ui/skeleton";
import { matchesName } from "@/lib/search";
import type { PickablePerson } from "@/services/people/queries";

export type PickedPerson = { kind: "existing"; partyId: string; name: string } | { kind: "new"; name: string };

export function PersonPicker({
  people,
  value,
  onChange,
  label,
  allowNew = true,
  exclude = [],
  skeleton = false,
}: {
  people: PickablePerson[];
  value: PickedPerson | null;
  onChange: (v: PickedPerson | null) => void;
  label?: string;
  allowNew?: boolean;
  exclude?: string[];

  skeleton?: boolean;
}) {
  const t = useTranslations("debt");
  const tp = useTranslations("people");
  const tc = useTranslations("common");
  const [q, setQ] = useState("");
  const list = useMemo(
    () => people.filter((p) => !exclude.includes(p.partyId) && matchesName(p.name, q)).slice(0, q ? 8 : 6),
    [people, q, exclude],
  );

  if (value) {
    return (
      <div className="flex flex-col gap-2">
        {label ? <span className="text-[13px] font-medium text-muted-foreground">{label}</span> : null}
        <div className="flex h-12 items-center gap-3 rounded-md border border-border pr-1 pl-2">
          {skeleton ? (
            <InitialSkeleton className="size-8" />
          ) : (
            <Initial name={value.name} className="size-8 text-[13px]" />
          )}
          <span className="flex-1 truncate text-[15px] font-semibold">
            {skeleton ? <SkeletonText w="9ch" /> : value.name}
          </span>
          {value.kind === "new" ? <span className="text-xs text-muted-foreground">{tp("manual")}</span> : null}
          <button
            type="button"
            aria-label={tc("change")}
            className="flex size-10 items-center justify-center"
            onClick={() => onChange(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    );
  }

  const exact = people.some((p) => p.name.toLowerCase() === q.trim().toLowerCase());
  return (
    <div className="flex flex-col gap-2">
      {label ? <span className="text-[13px] font-medium text-muted-foreground">{label}</span> : null}
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("whoPlaceholder")}
        autoComplete="off"
        aria-label={label}
      />
      <ul className="flex flex-col">
        {skeleton
          ? ["10ch", "7ch", "12ch", "8ch"].map((w) => (
              <li key={w}>
                <div className="flex w-full items-center gap-3 rounded-md px-1 py-2">
                  <InitialSkeleton className="size-9" />
                  <span className="flex-1 truncate text-[15px] font-medium">
                    <SkeletonText w={w} />
                  </span>
                </div>
              </li>
            ))
          : null}
        {list.map((p) => (
          <li key={p.partyId}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-soft"
              onClick={() => onChange({ kind: "existing", partyId: p.partyId, name: p.name })}
            >
              <Initial
                name={p.name}
                className={`size-9 text-sm ${p.state === "USER" ? "" : "bg-soft text-foreground"}`}
              />
              <span className="flex-1 truncate text-[15px] font-medium">{p.name}</span>
              {p.state === "MANUAL" ? <span className="text-xs text-muted-foreground">{tp("manual")}</span> : null}
            </button>
          </li>
        ))}
        {allowNew && q.trim() && !exact ? (
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-soft"
              onClick={() => onChange({ kind: "new", name: q.trim().slice(0, 60) })}
            >
              <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-border">
                <Plus className="size-4" />
              </span>
              <span className="text-[15px] font-semibold">{t("addNew", { name: q.trim() })}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
