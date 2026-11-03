"use client";

import { useTranslations } from "next-intl";

import { MemberPicker, type MemberSelection } from "@/components/forms/member-picker";
import { Switch } from "@/components/ui/switch";
import type { PickablePerson } from "@/services/people/queries";

export function BillParticipants({
  includeMe,
  setIncludeMe,
  people,
  sel,
  setSel,
  myPartyId,
}: {
  includeMe: boolean;
  setIncludeMe: (value: boolean) => void;
  people: PickablePerson[];
  sel: MemberSelection;
  setSel: (value: MemberSelection) => void;
  myPartyId: string;
}) {
  const t = useTranslations("bill");
  return (
    <>
      <label className="flex items-center justify-between gap-3 text-sm font-medium">
        {t("includeMe")}
        <Switch checked={includeMe} onCheckedChange={setIncludeMe} />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{t("participants")}</span>
        <MemberPicker people={people} value={sel} onChange={setSel} exclude={[myPartyId]} />
      </div>
    </>
  );
}
