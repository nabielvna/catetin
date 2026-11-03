"use client";

import { ChevronRight, Laptop, Loader2, LogOut, Smartphone, Tablet } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { signOutDevice, signOutOtherDevices } from "@/actions/account";
import { useAction } from "@/components/forms/use-action";
import { SettingsGroup, SettingsRow } from "@/components/layout/settings";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { SkeletonText } from "@/components/ui/skeleton";
import { diffDays, todayIn } from "@/domain/dates";
import type { DeviceKind } from "@/lib/user-agent";

type Device = {
  id: string;
  current: boolean;
  browser: string | null;
  os: string | null;
  kind: DeviceKind;
  signedInAt: string;
  lastActiveAt: string;
  ip: string | null;
  place: string | null;
  model: string | null;
};

const ICONS = { phone: Smartphone, tablet: Tablet, desktop: Laptop } as const;

export function DevicesView({ devices, timezone }: { devices: Device[]; timezone: string }) {
  const t = useTranslations("account");
  const format = useFormatter();
  const { pending, run } = useAction();

  const [shown, setShown] = useState<Device | "others" | null>(null);
  const [open, setOpen] = useState(false);
  const show = (c: Device | "others") => {
    setShown(c);
    setOpen(true);
  };

  const name = (d: Device) =>
    d.model
      ? [d.model, d.browser].filter(Boolean).join(" · ")
      : d.browser && d.os
        ? `${d.browser} · ${d.os}`
        : (d.os ?? d.browser ?? t("unknownDevice"));
  const date = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", year: "numeric" });
  const dateTime = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const activity = (d: Device) => {
    if (d.current) return t("activeNow");
    const ago = diffDays(todayIn(timezone, new Date(d.lastActiveAt)), todayIn(timezone, new Date()));
    return ago <= 0
      ? t("activeToday")
      : ago === 1
        ? t("activeYesterday")
        : t("activeOn", { date: date(d.lastActiveAt) });
  };

  const current = devices.find((d) => d.current);
  const others = devices.filter((d) => !d.current);
  const row = (d: Device) => (
    <SettingsRow
      key={d.id}
      icon={ICONS[d.kind]}
      label={name(d)}
      hint={[d.place ?? t("unknownPlace"), activity(d)].join(" · ")}
      onClick={() => show(d)}
    />
  );

  const detail = shown && shown !== "others" ? shown : null;
  const facts = detail
    ? [
        ...(detail.model ? [[t("deviceModel"), detail.model]] : []),
        [t("deviceBrowser"), detail.browser ?? "—"],
        [t("deviceSystem"), detail.os ?? "—"],
        [t("devicePlace"), detail.place ?? t("unknownPlace")],
        [t("deviceIp"), detail.ip ?? t("localNetwork")],
        [t("deviceSignedIn"), dateTime(detail.signedInAt)],
        [t("deviceLastActive"), activity(detail)],
      ]
    : [];

  return (
    <div className="pb-10">
      {current ? <SettingsGroup title={t("thisDevice")}>{row(current)}</SettingsGroup> : null}

      <SettingsGroup title={t("otherDevices")} footer={others.length > 0 ? t("devicesFooter") : undefined}>
        {others.length > 0 ? (
          others.map(row)
        ) : (
          <p className="px-4 py-4 text-[15px] text-muted-foreground">{t("noOtherDevices")}</p>
        )}
      </SettingsGroup>

      {others.length > 1 ? (
        <SettingsGroup>
          <SettingsRow
            icon={LogOut}
            tone="neg"
            label={t("signOutOthers")}
            trailing={false}
            onClick={() => show("others")}
            tour="devices.signOutOthers"
          />
        </SettingsGroup>
      ) : null}

      <p className="px-5 pt-4 text-xs leading-relaxed text-muted-foreground">{t("placeNote")}</p>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent data-tour="devices.sheet">
          {shown === "others" ? (
            <DrawerHeader>
              <DrawerTitle>{t("signOutOthers")}</DrawerTitle>
              <DrawerDescription>{t("signOutOthersBody")}</DrawerDescription>
            </DrawerHeader>
          ) : detail ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{name(detail)}</DrawerTitle>
                {detail.current ? <DrawerDescription>{t("thisDevice")}</DrawerDescription> : null}
              </DrawerHeader>
              <dl className="mx-5 flex flex-col divide-y divide-border/60 rounded-lg bg-soft">
                {facts.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 px-4 py-3 text-[15px]">
                    <dt className="shrink-0 text-muted-foreground">{k}</dt>
                    <dd className="min-w-0 text-right font-medium wrap-break-word">{v}</dd>
                  </div>
                ))}
              </dl>
              {!detail.current ? (
                <p className="px-5 pt-3 text-[13px] leading-relaxed text-muted-foreground">{t("signOutDeviceBody")}</p>
              ) : null}
            </>
          ) : null}
          {shown === "others" || (detail && !detail.current) ? (
            <DrawerFooter>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (shown === "others") {
                    run(() => signOutOtherDevices({}), {
                      success: (r) => t("signedOutOthers", { count: r.count }),
                      onSuccess: () => setOpen(false),
                    });
                  } else if (detail) {
                    run(() => signOutDevice({ id: detail.id }), {
                      success: t("signedOutDevice"),
                      onSuccess: () => setOpen(false),
                    });
                  }
                }}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                {shown === "others" ? t("signOutOthers") : t("signOutThisOne")}
              </Button>
            </DrawerFooter>
          ) : (
            <div className="h-6" />
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export function DevicesSkeleton() {
  const t = useTranslations("account");
  const row = (
    <SettingsRow
      icon={Smartphone}
      label={<SkeletonText w="13ch" className="bg-background" />}
      hint={<SkeletonText w="20ch" className="bg-background" />}
      trailing={<ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
    />
  );
  return (
    <div className="pb-10" aria-busy>
      <SettingsGroup title={t("thisDevice")}>{row}</SettingsGroup>
      <SettingsGroup title={t("otherDevices")}>{row}</SettingsGroup>
      <p className="px-5 pt-4 text-xs leading-relaxed text-muted-foreground">{t("placeNote")}</p>
    </div>
  );
}
