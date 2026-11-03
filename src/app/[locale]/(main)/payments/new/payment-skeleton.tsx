"use client";

import { useTranslations } from "next-intl";

import { Chips } from "@/components/forms/chips";
import { MoneyInput } from "@/components/forms/money-input";
import { InitialSkeleton } from "@/components/layout/skeletons";
import { ScanCardButton } from "@/components/scan/scan-section";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const noop = () => {};

type Variant = "pick" | "payment" | "offset";

export function PaymentSkeleton({ variant = "pick" }: { variant?: Variant }) {
  if (variant === "offset") return <OffsetFormSkeleton />;
  if (variant === "payment") return <PaymentFormSkeleton />;
  return <PickPayeeSkeleton />;
}

function PickPayeeSkeleton() {
  const t = useTranslations("payment");
  return (
    <div className="flex flex-col px-5" aria-busy>
      <span className="pb-2 text-[13px] font-medium text-muted-foreground">{t("who")}</span>
      <ul>
        {["10ch", "7ch", "12ch", "8ch"].map((w) => (
          <li key={w} className="border-b border-line last:border-0">
            <div className="flex items-center gap-3 py-3">
              <InitialSkeleton />
              <span className="flex-1 truncate text-[15px] font-semibold">
                <SkeletonText w={w} />
              </span>
              <span className="text-[15px] font-bold num whitespace-nowrap">
                <SkeletonText w="6ch" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentFormSkeleton() {
  const t = useTranslations("payment");
  const tc = useTranslations("common");
  return (
    <form inert aria-busy className="flex flex-col gap-6 px-5 pt-2 pb-10">
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-md bg-soft p-1">
        <span className="flex h-10 items-center justify-center rounded-sm bg-background px-2 text-sm font-semibold shadow-sm">
          <SkeletonText w="11ch" />
        </span>
        <span className="flex h-10 items-center justify-center rounded-sm px-2 text-sm font-semibold">
          <SkeletonText w="9ch" className="bg-background" />
        </span>
      </div>

      <ScanCardButton purpose="payment" tabIndex={-1} />

      <div className="flex flex-col gap-2">
        <MoneyInput skeleton label={t("amount")} value="" currency="IDR" onChange={noop} />
        <span className="self-start rounded-md border border-border px-3 py-1.5 text-[13px] font-semibold">
          <SkeletonText w="14ch" />
        </span>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        {t("crossCurrency")}
        <Switch checked={false} />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{t("method")}</span>
        <Chips
          ariaLabel={t("method")}
          value="TRANSFER"
          onChange={noop}
          options={(["TRANSFER", "CASH", "EWALLET", "OTHER"] as const).map((m) => ({
            value: m,
            label: t(`methods.${m}`),
          }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-muted-foreground">{t("allocation")}</span>
          <span className="text-[13px] font-semibold">{t("manual")}</span>
        </div>
        <ul className="flex flex-col">
          {["12ch", "9ch"].map((w) => (
            <li key={w} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] font-medium">
                  <SkeletonText w={w} />
                </span>
                <span className="text-xs text-muted-foreground">
                  <SkeletonText w="8ch" />
                </span>
              </div>
              <span className="text-[15px] font-bold num">—</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label>{t("date")}</Label>
          <div className="flex h-12 items-center rounded-md border border-input px-3 text-base">
            <SkeletonText w="9ch" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>
          {t("note")} <span className="font-normal">({tc("optional")})</span>
        </Label>
        <Textarea readOnly tabIndex={-1} />
      </div>

      <Button type="button" size="lg" disabled>
        {tc("save")}
      </Button>
    </form>
  );
}

function OffsetFormSkeleton() {
  const t = useTranslations("offset");
  return (
    <form inert aria-busy className="flex flex-col gap-6 px-5 pt-2 pb-10">
      <h2 className="text-xl font-bold tracking-[-0.02em]">{t("title")}</h2>
      <p className="text-[15px] text-muted-foreground">
        <SkeletonText w="100%" />
        <br />
        <SkeletonText w="100%" />
        <br />
        <SkeletonText w="60%" />
      </p>
      <MoneyInput skeleton label={t("amount")} value="" currency="IDR" onChange={noop} />
      <p className="text-[13px] text-muted-foreground">
        <SkeletonText w="18ch" />
      </p>
      <Button type="button" size="lg">
        {t("submit")}
      </Button>
    </form>
  );
}
