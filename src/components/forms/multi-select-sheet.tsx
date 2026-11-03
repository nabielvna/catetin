"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export type MultiOption = { value: string; label: string; count?: number };

export function MultiSelectSheet({
  open,
  onOpenChange,
  title,
  options,
  value,
  onApply,
  applyLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: MultiOption[];
  value: string[];
  onApply: (value: string[]) => void;
  applyLabel: (draft: string[]) => string;
}) {
  const t = useTranslations("records");
  const [draft, setDraft] = useState(value);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(value);
  }
  const toggle = (v: string, on: boolean) => setDraft((d) => (on ? [...d, v] : d.filter((x) => x !== v)));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85dvh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{t("multiHint")}</DrawerDescription>
        </DrawerHeader>
        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
          {options.map((o) => {
            const on = draft.includes(o.value);
            return (
              <li key={o.value} className="border-b border-line last:border-0">
                <label className="flex min-h-13 cursor-pointer items-center gap-3.5 py-2">
                  <Checkbox checked={on} onCheckedChange={(c) => toggle(o.value, c === true)} className="size-5" />
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{o.label}</span>
                  {o.count !== undefined ? (
                    <span className="text-[13px] num text-muted-foreground">{o.count}</span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
        <DrawerFooter className="grid grid-cols-[1fr_2fr] gap-2">
          <Button type="button" variant="outline" onClick={() => setDraft([])} disabled={draft.length === 0}>
            {t("reset")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            {applyLabel(draft)}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
