"use client";

import { Loader2, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { setLabels } from "@/actions/debts";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { LabelInput } from "@/components/forms/label-input";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export function DebtLabels({ id, labels, suggestions }: { id: string; labels: string[]; suggestions: string[] }) {
  const t = useTranslations("labels");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(labels);
  const { pending, run } = useAction();

  const review = useReview<{ action: string; debtId?: string; labels?: string[] }>({
    tools: ["manageDebt"],
    match: (i) => i.action === "SET_LABELS" && i.debtId === id,
    apply: (i) => {
      setValue(i.labels ?? []);
      setOpen(true);
    },
  });
  return (
    <>
      <button
        type="button"
        data-tour="debt.labels.open"
        onClick={() => {
          setValue(labels);
          setOpen(true);
        }}
        className="flex w-full items-center justify-between gap-4 border-b border-line py-3 text-left text-[15px]"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Tag className="size-4" /> {t("title")}
        </span>
        <span className="truncate text-right font-medium">
          {labels.length ? (
            labels.map((l) => `#${l}`).join(" ")
          ) : (
            <span className="text-muted-foreground">{t("add")}</span>
          )}
        </span>
      </button>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent data-tour="debt.labels.sheet">
          <DrawerHeader>
            <DrawerTitle>{t("title")}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-4 px-5">
            <ReviewBanner review={review} />
            <LabelInput value={value} onChange={setValue} suggestions={suggestions} />
          </div>
          <DrawerFooter>
            <Button
              disabled={pending}
              onClick={() =>
                run(() => setLabels({ obligationId: id, names: value }), {
                  success: t("saved"),
                  onSuccess: () => {
                    void review.finish();
                    setOpen(false);
                  },
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {tc("save")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
