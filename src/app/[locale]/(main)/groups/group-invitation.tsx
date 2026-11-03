"use client";

import { useTranslations } from "next-intl";

import { respondInvite } from "@/actions/groups";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";

export function GroupInvitation({
  group,
}: {
  group: { id: string; name: string; mode: "CONFIRM" | "TRUST"; invitedBy: string | null };
}) {
  const t = useTranslations("groups");
  const { pending, run } = useAction();
  return (
    <section
      data-tour="group.invitation"
      className="mt-2 flex flex-col gap-3 rounded-lg bg-inverse p-4 text-inverse-foreground"
    >
      <span className="text-[17px] font-bold">
        {t("invitation", { actor: group.invitedBy ?? "?", group: group.name })}
      </span>
      <span className="text-[13px] text-inverse-muted">
        {t("joinAgree", { mode: t(`modes.${group.mode}`) })} {t(`modeHints.${group.mode}`)}
      </span>
      <div className="flex gap-2">
        <Button
          variant="inverse-outline"
          className="h-11 flex-1"
          disabled={pending}
          onClick={() => run(() => respondInvite({ groupId: group.id, accept: false }))}
        >
          {t("decline")}
        </Button>
        <Button
          variant="inverse"
          className="h-11 flex-2"
          disabled={pending}
          onClick={() => run(() => respondInvite({ groupId: group.id, accept: true }))}
        >
          {t("accept")}
        </Button>
      </div>
    </section>
  );
}
