"use client";

import { BellRing, ChevronRight, Clock, Mail, Moon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Topic } from "@/app/[locale]/(main)/account/notification-settings";
import { PushHintSkeleton } from "@/app/[locale]/(main)/account/notification-settings";
import { SettingsGroup, SettingsRow } from "@/components/layout/settings";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
export function NotificationsSkeleton() {
  const t = useTranslations("account");
  const toggle = <Skeleton className="h-[16.6px] w-7 shrink-0 rounded-full bg-background" />;
  const chevron = <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  const value = (w: string) => <SkeletonText w={w} className="bg-background" />;
  const topics: Topic[] = ["ACTION", "INFO", "REMINDER"];
  const topicRows = (channel: string) =>
    topics.map((topic) => (
      <SettingsRow
        key={`${channel}-${topic}`}
        label={t(`topics.${topic}`)}
        hint={t(`topicHints.${topic}`)}
        trailing={toggle}
      />
    ));
  return (
    <div className="pb-10" aria-busy>
      <SettingsGroup className="pt-2">
        <SettingsRow
          icon={BellRing}
          label={t("pushThisDevice")}
          hint={<PushHintSkeleton />}
          trailing={<Switch aria-hidden tabIndex={-1} checked={false} disabled />}
        />
      </SettingsGroup>
      <SettingsGroup title={t("pushTopicsTitle")}>{topicRows("PUSH")}</SettingsGroup>
      <SettingsGroup title={t("emailTopicsTitle")} footer={t("inboxAlways")}>
        {topicRows("EMAIL")}
      </SettingsGroup>
      <SettingsGroup title={t("digestTitle")} footer={t("digestHint")}>
        <SettingsRow icon={Mail} label={t("digestLabel")} value={value("8ch")} trailing={chevron} />
      </SettingsGroup>
      <SettingsGroup title={t("quietTitle")}>
        <SettingsRow icon={Moon} label={t("quietToggle")} hint={t("quietToggleHint")} trailing={toggle} />
        {}
        <SettingsRow icon={Clock} label={t("quietTime")} value={value("11ch")} trailing={chevron} />
      </SettingsGroup>
    </div>
  );
}
