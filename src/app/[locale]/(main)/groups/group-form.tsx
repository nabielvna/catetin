"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { newGroup } from "@/actions/groups";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { MemberPicker, MemberPickerSkeleton, type MemberSelection } from "@/components/forms/member-picker";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Currency } from "@/domain/money";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { PickablePerson } from "@/services/people/queries";

export function GroupForm({
  people,
  currency,
  skeleton = false,
}: {
  people: PickablePerson[];
  currency: Currency;

  skeleton?: boolean;
}) {
  const t = useTranslations("groups");
  const tc = useTranslations("common");
  const router = useRouter();

  const [id] = useState(() => (skeleton ? "" : uuidv7()));
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"CONFIRM" | "TRUST">("CONFIRM");
  const [members, setMembers] = useState<MemberSelection>({ ids: [], manual: [] });
  const [groupCurrency, setGroupCurrency] = useState<Currency>(currency);
  const { pending, run } = useAction();

  const review = useReview<{
    action: string;
    name?: string;
    mode?: "CONFIRM" | "TRUST";
    currency?: Currency;
    members?: Array<{ partyId?: string; newPersonName?: string }>;
  }>({
    tools: ["manageGroup"],
    match: (i) => i.action === "CREATE",
    off: skeleton,
    apply: (i) => {
      setName(i.name ?? "");
      setMode(i.mode ?? "CONFIRM");
      if (i.currency) setGroupCurrency(i.currency);
      const list = i.members ?? [];
      setMembers({
        ids: list.flatMap((m) => (m.partyId && people.some((p) => p.partyId === m.partyId) ? [m.partyId] : [])),
        manual: list.flatMap((m) =>
          !m.partyId && m.newPersonName ? [{ id: uuidv7(), name: m.newPersonName.trim() }] : [],
        ),
      });
    },
  });

  return (
    <form
      inert={skeleton}
      aria-busy={skeleton || undefined}
      className="flex flex-col gap-6 px-5 pt-2 pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            newGroup({
              id,
              name: name.trim(),
              mode,
              currency: groupCurrency,
              memberIds: members.ids,
              newManual: members.manual,
            }),
          {
            onSuccess: (d) => {
              void review.finish();
              router.replace(`/groups/${d.id}`);
            },
          },
        );
      }}
    >
      <ReviewBanner review={review} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="gname">{t("name")}</Label>
        <Input
          id="gname"
          autoFocus
          required
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-2 text-[13px] font-medium text-muted-foreground">{t("mode")}</legend>
        {(["CONFIRM", "TRUST"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex flex-col gap-0.5 rounded-md border px-4 py-3 text-left",
              mode === m ? "border-foreground" : "border-border",
            )}
          >
            <span className="text-[15px] font-semibold">{t(`modes.${m}`)}</span>
            <span className="text-[13px] text-muted-foreground">{t(`modeHints.${m}`)}</span>
          </button>
        ))}
      </fieldset>
      {groupCurrency !== currency ? (
        <p className="text-[13px] text-muted-foreground">{t("currencyLine", { currency: groupCurrency })}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{t("members")}</span>
        {skeleton ? <MemberPickerSkeleton /> : <MemberPicker people={people} value={members} onChange={setMembers} />}
      </div>
      <Button type="submit" size="lg" disabled={pending || !name.trim()} data-tour="group.create.submit">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {tc("save")}
      </Button>
    </form>
  );
}

export function GroupFormSkeleton() {
  return <GroupForm skeleton people={[]} currency="IDR" />;
}
