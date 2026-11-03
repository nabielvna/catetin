"use client";

import { useTranslations } from "next-intl";

import { block } from "@/actions/people";
import { useAction } from "@/components/forms/use-action";
import { SettingsGroup, SettingsRow } from "@/components/layout/settings";
import { Initial } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { SkeletonText } from "@/components/ui/skeleton";
import type { BlockedPerson } from "@/services/people/blocks";

export function BlockedView({ people }: { people: BlockedPerson[] }) {
  const t = useTranslations("account");
  const tp = useTranslations("person");
  const { pending, run } = useAction();
  return (
    <SettingsGroup className="pt-2" footer={t("blockedHint")}>
      {people.length === 0 ? (
        <SettingsRow label={t("blockedEmpty")} />
      ) : (
        people.map((p) => (
          <SettingsRow
            key={p.partyId}
            label={
              <span className="flex items-center gap-3">
                <Initial name={p.name} className="size-8 text-sm" />
                {p.name}
              </span>
            }
            trailing={
              <Button
                size="xs"
                variant="outline"
                disabled={pending}
                data-tour="blocked.unblock"
                onClick={() =>
                  run(() => block({ partyId: p.partyId, blocked: false }), {
                    success: tp("block.unblocked", { name: p.name }),
                  })
                }
              >
                {t("unblock")}
              </Button>
            }
          />
        ))
      )}
    </SettingsGroup>
  );
}

export function BlockedSkeleton() {
  const t = useTranslations("account");
  return (
    <SettingsGroup className="pt-2" footer={t("blockedHint")}>
      <SettingsRow label={<SkeletonText w="14ch" className="bg-background" />} />
    </SettingsGroup>
  );
}
