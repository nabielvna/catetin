"use client";

import { Handshake, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { trust } from "@/actions/people";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import type { TrustState } from "@/services/people/trust";

export function PersonTrust({ partyId, name, state }: { partyId: string; name: string; state: TrustState }) {
  const t = useTranslations("trust");
  const tc = useTranslations("common");
  const [confirm, setConfirm] = useState(false);
  const { pending, run } = useAction();
  const on = state === "ON" || state === "I_ASKED";

  const set = (value: boolean) =>
    run(() => trust({ partyId, on: value }), {
      success: (d) =>
        d.state === "ON" ? t("nowOn", { name }) : d.state === "I_ASKED" ? t("asked", { name }) : t("off"),
      onSuccess: () => setConfirm(false),
    });

  return (
    <>
      <div className="flex items-center gap-3 rounded-md bg-soft px-3.5 py-3">
        <Handshake className="size-5 shrink-0" strokeWidth={1.8} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[14px] font-semibold">
            {state === "ON"
              ? t("onTitle", { name })
              : state === "I_ASKED"
                ? t("waitingTitle", { name })
                : state === "THEY_ASKED"
                  ? t("invitedTitle", { name })
                  : t("title")}
          </span>
          <span className="text-[12.5px] leading-snug text-muted-foreground">
            {state === "ON" ? t("onHint") : state === "I_ASKED" ? t("waitingHint", { name }) : t("offHint")}
          </span>
        </div>
        {state === "THEY_ASKED" ? (
          <Button size="xs" data-tour="person.trust.switch" onClick={() => setConfirm(true)} disabled={pending}>
            {t("accept")}
          </Button>
        ) : (
          <Switch
            checked={on}
            disabled={pending}
            aria-label={t("title")}
            data-tour="person.trust.switch"
            onCheckedChange={(v) => (v ? setConfirm(true) : set(false))}
          />
        )}
      </div>

      <Drawer open={confirm} onOpenChange={setConfirm}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("confirmTitle", { name })}</DrawerTitle>
            <DrawerDescription>{t("confirmBody", { name })}</DrawerDescription>
          </DrawerHeader>
          <ul className="flex list-disc flex-col gap-1.5 px-9 text-[14px] leading-snug">
            <li>{t("point1")}</li>
            <li>{t("point2")}</li>
            <li>{t("point3")}</li>
            <li>{t("point4")}</li>
          </ul>
          <DrawerFooter>
            <Button data-tour="person.trust.confirm" onClick={() => set(true)} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {state === "THEY_ASKED" ? t("accept") : t("turnOn")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {tc("cancel")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
