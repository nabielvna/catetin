"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { editDebt } from "@/actions/debts";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { Chips } from "@/components/forms/chips";
import { MoneyInput } from "@/components/forms/money-input";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIES, type Category, diffObligation } from "@/domain/debt";
import { type InstallmentPlan, INSTALLMENTS_MAX, INSTALLMENTS_MIN } from "@/domain/installments";
import { type Currency, fromMajor, toInputString } from "@/domain/money";
import { classifyChangeHarm } from "@/domain/policy";
import { useRouter } from "@/i18n/navigation";
import { money } from "@/lib/format";

type Debt = {
  id: string;
  amount: number;
  currency: Currency;
  title: string;
  note: string | null;
  category: string | null;
  occurredOn: string;
  dueOn: string | null;
  installments: InstallmentPlan | null;
  hasItems: boolean;
  minAmount: number;
  iAmCreditor: boolean;
  counterpartName: string;
  pending: boolean;
};

type EditInput = {
  action: string;
  debtId?: string;
  amount?: number;
  title?: string;
  note?: string;
  category?: string;
  occurredOn?: string;
  dueOn?: string;
  clearDueOn?: boolean;
};

export function EditDebtForm({ debt, today }: { debt: Debt; today: string }) {
  const t = useTranslations("debt");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const tcat = useTranslations("categories");
  const locale = useLocale();
  const router = useRouter();
  const [raw, setRaw] = useState(toInputString(debt.amount, debt.currency));
  const [amount, setAmount] = useState<number | null>(debt.amount);
  const [title, setTitle] = useState(debt.title);
  const [note, setNote] = useState(debt.note ?? "");
  const [category, setCategory] = useState<Category | null>((debt.category as Category) ?? null);
  const [occurredOn, setOccurredOn] = useState(debt.occurredOn);
  const [dueOn, setDueOn] = useState(debt.dueOn ?? "");
  const plan0 = debt.installments;
  const [instCount, setInstCount] = useState(String(plan0?.count ?? 3));
  const [instEvery, setInstEvery] = useState<"WEEK" | "MONTH">(plan0?.every ?? "MONTH");
  const [instFirst, setInstFirst] = useState(plan0?.firstDue ?? today);
  const count = Number(instCount);
  const planValid = !plan0 || (Number.isInteger(count) && count >= INSTALLMENTS_MIN && count <= INSTALLMENTS_MAX);
  const plan: InstallmentPlan | null = plan0 ? { count, every: instEvery, firstDue: instFirst } : null;
  const planChanged =
    plan0 !== null &&
    plan !== null &&
    (plan.count !== plan0.count || plan.every !== plan0.every || plan.firstDue !== plan0.firstDue);
  const { pending, run } = useAction();

  const review = useReview<EditInput>({
    tools: ["manageDebt"],
    match: (i) => i.action === "EDIT" && i.debtId === debt.id,
    apply: (i) => {
      if (i.amount !== undefined) {
        const minor = fromMajor(i.amount, debt.currency);
        setRaw(toInputString(minor, debt.currency));
        setAmount(minor);
      }
      if (i.title !== undefined) setTitle(i.title);
      if (i.note !== undefined) setNote(i.note);
      if (i.category !== undefined) setCategory(i.category as Category);
      if (i.occurredOn !== undefined) setOccurredOn(i.occurredOn);
      if (i.clearDueOn) setDueOn("");
      else if (i.dueOn !== undefined) setDueOn(i.dueOn);
    },
  });

  const patch = {
    ...(amount !== null && amount !== debt.amount ? { amount } : {}),
    ...(!plan0 && (dueOn || null) !== debt.dueOn ? { dueOn: dueOn || null } : {}),
    ...(planChanged && planValid ? { installments: plan } : {}),
    ...(title.trim() !== debt.title ? { title: title.trim() } : {}),
    ...((note.trim() || null) !== debt.note ? { note: note.trim() || null } : {}),
    ...(category !== debt.category ? { category } : {}),
    ...(occurredOn !== debt.occurredOn ? { occurredOn } : {}),
  };
  let needsApproval = false;
  let mixed = false;
  if (!debt.pending) {
    try {
      const { change } = diffObligation(
        {
          amount: debt.amount,
          currency: debt.currency,
          dueOn: debt.dueOn,
          installments: plan0,
          title: debt.title,
          note: debt.note,
          category: debt.category,
          occurredOn: debt.occurredOn,
          itemsKey: "",
        },
        patch,
      );
      const harmed = classifyChangeHarm(change);
      needsApproval = harmed.some((r) => (r === "DEBTOR" ? debt.iAmCreditor : !debt.iAmCreditor));
    } catch {
      mixed = true;
    }
  }
  const tooLow = amount !== null && amount < debt.minAmount;
  const changed = Object.keys(patch).length > 0;
  const valid =
    changed &&
    planValid &&
    amount !== null &&
    title.trim() &&
    !tooLow &&
    !mixed &&
    !(debt.hasItems && patch.amount !== undefined) &&
    !(plan && amount !== null && amount < plan.count);

  return (
    <form
      className="flex flex-col gap-6 px-5 pt-2 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        run(() => editDebt({ id: debt.id, patch }), {
          success: (d) => (d.status === "PROPOSED" ? t("editPending", { name: debt.counterpartName }) : t("saved")),
          onSuccess: () => {
            void review.finish();
            router.replace(`/debts/${debt.id}`);
          },
        });
      }}
    >
      <ReviewBanner review={review} />
      <MoneyInput
        label={t("amount")}
        value={raw}
        currency={debt.currency}
        invalidHint={te("INVALID_INPUT")}
        onChange={(r, p) => {
          setRaw(r);
          setAmount(p);
        }}
      />
      {tooLow ? (
        <p className="text-sm text-neg">
          {te("AMOUNT_BELOW_PAID")} ({money(debt.minAmount, debt.currency, locale)})
        </p>
      ) : null}
      {debt.hasItems && patch.amount !== undefined ? <p className="text-sm text-neg">{te("ITEMS_MISMATCH")}</p> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">{t("title")}</Label>
        <Input id="title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="date">{t("date")}</Label>
          <Input id="date" type="date" value={occurredOn} max={today} onChange={(e) => setOccurredOn(e.target.value)} />
        </div>
        {plan0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="inst-first">{t("instFirst")}</Label>
            <Input id="inst-first" type="date" value={instFirst} onChange={(e) => setInstFirst(e.target.value)} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Label htmlFor="due">{t("due")}</Label>
            <Input id="due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          </div>
        )}
      </div>
      {plan0 ? (
        <div className="grid grid-cols-[96px_1fr] gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="inst-count">{t("instCount")}</Label>
            <Input
              id="inst-count"
              inputMode="numeric"
              value={instCount}
              aria-invalid={!planValid}
              onChange={(e) => setInstCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-muted-foreground">{t("instEvery")}</span>
            <Chips
              ariaLabel={t("instEvery")}
              value={instEvery}
              onChange={setInstEvery}
              options={[
                { value: "MONTH", label: t("perMonth") },
                { value: "WEEK", label: t("perWeek") },
              ]}
            />
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{t("category")}</span>
        <Chips
          ariaLabel={t("category")}
          value={category}
          onChange={setCategory}
          options={CATEGORIES.map((c) => ({ value: c, label: tcat(c) }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note">{t("note")}</Label>
        <Textarea id="note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
      </div>
      {mixed ? <p className="text-sm text-neg">{te("MIXED_CHANGE")}</p> : null}
      {needsApproval && !mixed ? (
        <p className="rounded-md bg-soft px-3.5 py-3 text-[13px]">{t("editPending", { name: debt.counterpartName })}</p>
      ) : null}
      <Button type="submit" size="lg" disabled={!valid || pending} data-tour="debt.edit.submit">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {tc("save")}
      </Button>
    </form>
  );
}
