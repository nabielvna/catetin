"use client";
import { BellRing, Clock, Mail, Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { subscribePush, unsubscribePush } from "@/actions/notifications";
import { setDigest, setNotificationPref, setQuiet } from "@/actions/notifications";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { NativeSelect } from "@/components/forms/native-select";
import { OptionSheet } from "@/components/forms/option-sheet";
import { useAction } from "@/components/forms/use-action";
import { SettingsGroup, SettingsRow } from "@/components/layout/settings";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { SkeletonText } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { disablePush, enablePush, type PushState, pushState } from "@/integrations/push/client";
export type Topic = "ACTION" | "INFO" | "REMINDER";

type Digest = "WEEKLY" | "DAILY" | "OFF";

type Settings = {
  quietStart: number;
  quietEnd: number;
  digest: Digest;
  prefs: Array<{ topic: Topic; PUSH: boolean; EMAIL: boolean }>;
};

const DEFAULT_QUIET = { start: 21, end: 8 };

const hh = (h: number) => `${String(h).padStart(2, "0")}.00`;

const hours = Array.from({ length: 24 }, (_, h) => h);

export function NotificationsView({ settings, vapidPublicKey }: { settings: Settings; vapidPublicKey: string | null }) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  const { pending, run } = useAction();
  const [push, setPush] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [quiet, setQuietState] = useState({ start: settings.quietStart, end: settings.quietEnd });
  const [draft, setDraft] = useState(quiet.start === quiet.end ? DEFAULT_QUIET : quiet);
  const [editing, setEditing] = useState(false);
  const [digest, setDigestState] = useState<Digest>(settings.digest);
  const [digestOpen, setDigestOpen] = useState(false);
  const quietOn = quiet.start !== quiet.end;

  useEffect(() => {
    void pushState(vapidPublicKey).then(setPush, () => setPush("unsupported"));
  }, [vapidPublicKey]);

  async function togglePush(on: boolean) {
    setBusy(true);
    try {
      setPush(on ? await enablePush(vapidPublicKey, subscribePush) : await disablePush(unsubscribePush));
    } catch {
      setPush(await pushState(vapidPublicKey).catch(() => "unsupported" as const));
    } finally {
      setBusy(false);
    }
  }

  function saveQuiet(next: { start: number; end: number }, onSuccess?: () => void) {
    setQuietState(next);
    run(() => setQuiet(next), { success: t("saved"), onSuccess });
  }

  const review = useReview<{ action: string; quietStart?: number; quietEnd?: number }>({
    tools: ["updateSettings"],
    match: (i) => i.action === "QUIET_HOURS",
    apply: (i) => {
      setDraft({ start: i.quietStart ?? DEFAULT_QUIET.start, end: i.quietEnd ?? DEFAULT_QUIET.end });
      setEditing(true);
    },
  });

  const topicRows = (channel: "PUSH" | "EMAIL") =>
    settings.prefs.map((p) => (
      <SettingsRow
        key={`${channel}-${p.topic}`}
        label={t(`topics.${p.topic}`)}
        hint={t(`topicHints.${p.topic}`)}
        trailing={
          <Switch
            aria-label={`${t(`topics.${p.topic}`)} · ${t(`channels.${channel}`)}`}
            defaultChecked={p[channel]}
            onCheckedChange={(v) => run(() => setNotificationPref({ topic: p.topic, channel, enabled: v }))}
          />
        }
      />
    ));

  return (
    <div className="pb-10">
      <SettingsGroup className="pt-2">
        <SettingsRow
          icon={BellRing}
          label={t("pushThisDevice")}
          tour="notif.push"
          hint={push ? t(`pushHint.${push}`) : <PushHintSkeleton />}
          trailing={
            <Switch
              aria-label={t("pushThisDevice")}
              checked={push === "on"}
              disabled={busy || push === null || push === "unsupported" || push === "denied"}
              onCheckedChange={(v) => void togglePush(v)}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        tour="notif.pushTopics"
        title={t("pushTopicsTitle")}
        footer={push === "off" ? t("pushTopicsOffHint") : undefined}
      >
        {topicRows("PUSH")}
      </SettingsGroup>

      <SettingsGroup tour="notif.emailTopics" title={t("emailTopicsTitle")} footer={t("inboxAlways")}>
        {topicRows("EMAIL")}
      </SettingsGroup>

      <SettingsGroup title={t("digestTitle")} footer={t("digestHint")}>
        <SettingsRow
          icon={Mail}
          label={t("digestLabel")}
          value={t(`digest.${digest}`)}
          onClick={() => setDigestOpen(true)}
          tour="notif.digest"
        />
      </SettingsGroup>
      <OptionSheet
        open={digestOpen}
        onOpenChange={setDigestOpen}
        title={t("digestLabel")}
        value={digest}
        options={(["WEEKLY", "DAILY", "OFF"] as const).map((v) => ({
          value: v,
          label: t(`digest.${v}`),
          hint: t(`digestHints.${v}`),
        }))}
        onSelect={(v) => {
          setDigestState(v);
          setDigestOpen(false);
          run(() => setDigest({ digest: v }), { success: t("saved") });
        }}
      />

      <SettingsGroup title={t("quietTitle")}>
        <SettingsRow
          icon={Moon}
          label={t("quietToggle")}
          hint={t("quietToggleHint")}
          tour="notif.quiet"
          trailing={
            <Switch
              aria-label={t("quietToggle")}
              checked={quietOn}
              disabled={pending}
              onCheckedChange={(v) => saveQuiet(v ? draft : { start: 0, end: 0 })}
            />
          }
        />
        {quietOn ? (
          <SettingsRow
            icon={Clock}
            label={t("quietTime")}
            value={`${hh(quiet.start)} – ${hh(quiet.end)}`}
            tour="notif.quietTime"
            onClick={() => {
              setDraft(quiet);
              setEditing(true);
            }}
          />
        ) : null}
      </SettingsGroup>

      <Drawer open={editing} onOpenChange={setEditing}>
        <DrawerContent data-tour="notif.quiet.sheet">
          <DrawerHeader>
            <DrawerTitle>{t("quietTitle")}</DrawerTitle>
          </DrawerHeader>
          <ReviewBanner review={review} className="mx-5 mb-4 flex items-start gap-3 rounded-xl bg-soft p-3" />
          <div className="grid grid-cols-2 gap-3 px-5">
            {(["start", "end"] as const).map((k) => (
              <div key={k} className="flex flex-col gap-2">
                <Label htmlFor={`quiet-${k}`}>{k === "start" ? t("quietFrom") : t("quietTo")}</Label>
                <NativeSelect
                  id={`quiet-${k}`}
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
                >
                  {hours.map((h) => (
                    <option key={h} value={h}>
                      {hh(h)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </div>
          <DrawerFooter>
            <Button
              disabled={pending || draft.start === draft.end}
              onClick={() => {
                saveQuiet(draft, () => void review.finish());
                setEditing(false);
              }}
            >
              {tc("save")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export function PushHintSkeleton() {
  return (
    <>
      <SkeletonText w="100%" className="bg-background" />
      <br />
      <SkeletonText w="60%" className="bg-background" />
    </>
  );
}
