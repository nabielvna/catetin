"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { cancel, decide } from "@/actions/approvals";
import { cancelPayment } from "@/actions/payments";
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
import { Input } from "@/components/ui/input";
import { money } from "@/lib/format";
import type { SettlementDetail } from "@/services/payments/queries";

export function PaymentActions({
  detail: s,
  name,
}: {
  detail: Pick<SettlementDetail, "id" | "amount" | "currency" | "iCreated" | "kind" | "pending" | "status">;
  name: string;
}) {
  const t = useTranslations("payment");
  const ti = useTranslations("inbox");
  const td = useTranslations("debt");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [confirm, setConfirm] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  const amount = money(s.amount, s.currency, locale);
  const p = s.pending;

  if (p?.approverIsMe) {
    const kindKey = s.kind === "OFFSET" && p.kind === "SETTLEMENT_CREATE" ? "OFFSET_CREATE" : p.kind;
    return (
      <section className="mx-4 mt-5 flex flex-col gap-3.5 rounded-lg bg-inverse p-4 text-inverse-foreground">
        <span className="text-lg leading-snug font-bold">
          {ti(`kinds.${kindKey as "SETTLEMENT_CREATE"}`, { actor: p.requesterName, amount })}
        </span>
        {rejecting ? (
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={ti("reasonPlaceholder")}
            className="border-inverse-line bg-transparent text-inverse-foreground placeholder:text-inverse-muted"
          />
        ) : null}
        <div className="flex gap-2">
          <Button
            variant="inverse-outline"
            className="h-11 flex-1"
            disabled={pending}
            onClick={() =>
              rejecting
                ? run(() => decide({ requestId: p.requestId, decision: "REJECT", reason: reason.trim() || null }))
                : setRejecting(true)
            }
          >
            {tc("reject")}
          </Button>
          {!rejecting ? (
            <Button
              variant="inverse"
              className="h-11 flex-2"
              disabled={pending}
              onClick={() => run(() => decide({ requestId: p.requestId, decision: "APPROVE" }))}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {tc("confirm")}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-5 pt-5">
      {p ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-soft px-3.5 py-3">
          <span className="text-[13px]">{td("waitingFor", { name: p.approverName ?? name })}</span>
          {p.requestedByMe ? (
            <Button
              size="xs"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => cancel({ requestId: p.requestId }))}
            >
              {ti("cancelRequest")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {s.status === "ACTIVE" && !p ? (
        <Button variant="outline" data-tour="payment.void" onClick={() => setConfirm(true)}>
          {t("void")}
        </Button>
      ) : null}
      {s.status === "PENDING" && s.iCreated && !p ? (
        <Button variant="outline" data-tour="payment.void" onClick={() => run(() => cancelPayment({ id: s.id }))}>
          {td("withdraw")}
        </Button>
      ) : null}
      <Drawer open={confirm} onOpenChange={setConfirm}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("void")}</DrawerTitle>
            <DrawerDescription>{t("voidConfirm")}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              variant="destructive"
              disabled={pending}
              data-tour="payment.void.confirm"
              onClick={() => run(() => cancelPayment({ id: s.id }), { onSuccess: () => setConfirm(false) })}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {tc("confirm")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              {tc("cancel")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
