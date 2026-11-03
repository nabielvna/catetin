"use client";

import { Ellipsis, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { cancel, decide } from "@/actions/approvals";
import { deleteDebt, forgiveDebt } from "@/actions/debts";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { todayIn } from "@/domain/dates";
import { Link } from "@/i18n/navigation";
import { formatDate, money } from "@/lib/format";
import type { ObligationDetail } from "@/services/debts/queries";

export function DebtDecision({
  detail,
  name,
}: {
  detail: Pick<ObligationDetail, "pending" | "amount" | "currency" | "iAmDebtor" | "title">;
  name: string;
}) {
  const t = useTranslations("debt");
  const ti = useTranslations("inbox");
  const tc = useTranslations("common");
  const tch = useTranslations("change");
  const locale = useLocale();
  const p = detail.pending!;
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const { pending, run } = useAction();

  const amount = money(detail.amount, detail.currency, locale);
  const headline =
    p.kind === "OBLIGATION_CREATE"
      ? detail.iAmDebtor
        ? t("confirmPrompt", { name: p.requesterName, amount })
        : ti("kinds.OBLIGATION_CREATE", { actor: p.requesterName, amount })
      : ti(`kinds.${p.kind as "OBLIGATION_UPDATE"}`, { actor: p.requesterName, title: detail.title, amount });

  const fields = ((p.payload.fields as string[] | undefined) ?? []).filter((f) => f !== "itemsKey");
  const before = (p.payload.before as Record<string, unknown> | undefined) ?? {};
  const after = (p.payload.patch as Record<string, unknown> | undefined) ?? {};
  const fmt = (f: string, v: unknown) => {
    if (v === null || v === undefined || v === "") return "—";
    if (f === "amount") return money(Number(v), detail.currency, locale);
    if (f === "dueOn" || f === "occurredOn") return formatDate(String(v), locale);
    if (f === "installments" && typeof v === "object") {
      const pl = v as { count: number; every: string; firstDue: string };
      return `${pl.count}× · ${t(pl.every === "WEEK" ? "perWeek" : "perMonth").toLowerCase()} · ${formatDate(pl.firstDue, locale)}`;
    }
    return String(v);
  };

  if (!p.approverIsMe) {
    return (
      <div className="mx-5 mt-5 flex items-center justify-between gap-3 rounded-md bg-soft px-3.5 py-3">
        <span className="text-[13px]">
          {p.kind === "OBLIGATION_UPDATE"
            ? t("editPending", { name: p.approverName ?? name })
            : t("waitingFor", { name: p.approverName ?? name })}
        </span>
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
    );
  }

  return (
    <section className="mx-4 mt-5 flex flex-col gap-3.5 rounded-lg bg-inverse p-4 text-inverse-foreground">
      <span className="text-lg leading-snug font-bold tracking-[-0.02em]">{headline}</span>
      {fields.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {fields.map((f) => (
            <li key={f}>
              <span className="text-inverse-muted">{tch(f as "amount")}: </span>
              <span className="line-through opacity-70">{fmt(f, before[f])}</span> → <b>{fmt(f, after[f])}</b>
            </li>
          ))}
        </ul>
      ) : null}
      {typeof p.payload.reason === "string" && p.payload.reason ? (
        <p className="text-sm text-inverse-muted">“{p.payload.reason}”</p>
      ) : null}
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
          onClick={() => {
            if (!rejecting) return setRejecting(true);
            run(() => decide({ requestId: p.requestId, decision: "REJECT", reason: reason.trim() || null }));
          }}
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
        ) : (
          <Button variant="inverse-outline" className="h-11 flex-1" onClick={() => setRejecting(false)}>
            {tc("cancel")}
          </Button>
        )}
      </div>
    </section>
  );
}

export function DebtMenu(props: {
  id: string;
  status: ObligationDetail["status"];
  iCreated: boolean;
  iAmCreditor: boolean;
  hasPayments: boolean;
  remaining: number;
  currency: string;
  name: string;
  pendingRequestId: string | null;
}) {
  const t = useTranslations("debt");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [confirm, setConfirm] = useState<"void" | "forgive" | null>(null);
  const { pending, run } = useAction();
  const canEdit = props.status === "ACTIVE" || (props.status === "PENDING" && props.iCreated);
  const canVoid = props.status === "ACTIVE" || (props.status === "PENDING" && props.iCreated);
  const canForgive = props.status === "ACTIVE" && props.iAmCreditor && props.remaining > 0;
  if (!canEdit && !canVoid && !canForgive) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tc("more")}
            data-tour="debt.menu"
            className="flex size-11 items-center justify-center rounded-md hover:bg-soft"
          >
            <Ellipsis className="size-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {canEdit ? (
            <DropdownMenuItem asChild data-tour="debt.menu.edit">
              <Link href={`/debts/${props.id}/edit`}>{tc("edit")}</Link>
            </DropdownMenuItem>
          ) : null}
          {canForgive ? (
            <DropdownMenuItem data-tour="debt.menu.forgive" onSelect={() => setConfirm("forgive")}>
              {t("forgive")}
            </DropdownMenuItem>
          ) : null}
          {canVoid ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" data-tour="debt.menu.void" onSelect={() => setConfirm("void")}>
                {props.status === "PENDING" ? t("withdraw") : t("void")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Drawer open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {confirm === "forgive" ? t("forgive") : props.status === "PENDING" ? t("withdraw") : t("void")}
            </DrawerTitle>
            <DrawerDescription>
              {confirm === "forgive"
                ? t("forgiveConfirm", { amount: money(props.remaining, props.currency, locale), name: props.name })
                : props.hasPayments
                  ? t("hasPayments", { count: 1 })
                  : props.status === "ACTIVE" && !props.iAmCreditor
                    ? `${t("voidConfirm")} ${t("voidNeedsApproval", { name: props.name })}`
                    : t("voidConfirm")}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              variant={confirm === "void" ? "destructive" : "default"}
              data-tour={confirm === "forgive" ? "debt.forgive.confirm" : "debt.void.confirm"}
              disabled={pending || (confirm === "void" && props.hasPayments)}
              onClick={() =>
                run<unknown>(
                  () =>
                    confirm === "forgive"
                      ? forgiveDebt({
                          obligationId: props.id,
                          paidOn: todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date()),
                        })
                      : deleteDebt({ id: props.id }),
                  { onSuccess: () => setConfirm(null) },
                )
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {tc("confirm")}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {tc("cancel")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
