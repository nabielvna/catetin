"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Input } from "@/components/ui/input";

const MAX = 10;

export function LabelInput({
  value,
  onChange,
  suggestions = [],
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
}) {
  const t = useTranslations("labels");
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const name = raw.replace(/^#+/, "").replace(/\s+/g, " ").trim().slice(0, 30);
    if (!name || value.length >= MAX || value.some((v) => v.toLowerCase() === name.toLowerCase())) return;
    onChange([...value, name]);
  };
  const unused = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="labels" className="text-[13px] font-medium text-muted-foreground">
        {t("title")}
      </label>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((l) => (
            <span
              key={l}
              className="flex h-8 items-center gap-1 rounded-full bg-soft pr-1 pl-3 text-[13px] font-semibold"
            >
              #{l}
              <button
                type="button"
                aria-label={`${t("title")}: ${l} ×`}
                onClick={() => onChange(value.filter((x) => x !== l))}
                className="flex size-6 items-center justify-center rounded-full hover:bg-foreground/10"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input
        id="labels"
        value={draft}
        placeholder={t("placeholder")}
        enterKeyHint="done"
        maxLength={31}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            add(v.slice(0, -1));
            setDraft("");
          } else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
            setDraft("");
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            add(draft);
            setDraft("");
          }
        }}
      />
      {unused.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {unused.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="h-7 rounded-full border border-border px-2.5 text-[12.5px] font-medium text-muted-foreground"
            >
              + #{s}
            </button>
          ))}
        </div>
      ) : null}
      <span className="text-[12.5px] text-muted-foreground">{t("hint")}</span>
    </div>
  );
}
