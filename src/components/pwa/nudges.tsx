"use client";

import { Bell, Download, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { subscribePush } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { enablePush } from "@/integrations/push/client";
import { NUDGE_COOKIE, type NudgeKind } from "@/lib/nudge";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const KEY_DAYS = "catetin:active-days";
const KEY_DISMISS = "catetin:nudge-dismissed";

const INSTALL_WAIT_MS = 5000;

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}

function remember(kind: NudgeKind | null) {
  document.cookie = `${NUDGE_COOKIE}=${kind ?? "none"}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export function Nudges({
  initial,
  ios,
  hasRecords,
  vapidPublicKey,
}: {
  initial: NudgeKind | null;

  ios: boolean;
  hasRecords: boolean;
  vapidPublicKey: string | null;
}) {
  const t = useTranslations("nudge");
  const tc = useTranslations("common");
  const [kind, setKind] = useState<NudgeKind | null>(initial);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const days = readJson<string[]>(KEY_DAYS, []);
    if (!days.includes(today)) localStorage.setItem(KEY_DAYS, JSON.stringify([...days, today].slice(-10)));
    const dismissed = readJson<Record<string, number>>(KEY_DISMISS, {});
    const recentlyDismissed = (k: string) => (dismissed[k] ?? 0) > Date.now() - 14 * 86_400_000;

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const canPush = "Notification" in window && "serviceWorker" in navigator && !!vapidPublicKey;
    const wantsPush = hasRecords && canPush && Notification.permission === "default" && !recentlyDismissed("push");
    const wantsInstall = !standalone && days.length + 1 >= 2 && !recentlyDismissed("install");

    const next: NudgeKind | null = wantsPush ? "push" : wantsInstall && ios ? "install" : null;
    remember(next);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial && initial !== next && !(initial === "install" && wantsInstall)) setKind(null);

    let prompted = false;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      prompted = true;
      setInstallEvent(e as BeforeInstallPromptEvent);
      if (!wantsPush && wantsInstall) remember("install");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const giveUp =
      initial === "install" && !ios
        ? window.setTimeout(() => {
            if (prompted) return;
            setKind((k) => (k === "install" ? null : k));
            remember(null);
          }, INSTALL_WAIT_MS)
        : undefined;
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.clearTimeout(giveUp);
    };
  }, [initial, ios, hasRecords, vapidPublicKey]);

  function dismiss() {
    if (!kind) return;
    const d = readJson<Record<string, number>>(KEY_DISMISS, {});
    localStorage.setItem(KEY_DISMISS, JSON.stringify({ ...d, [kind]: Date.now() }));
    remember(null);
    setKind(null);
  }

  async function turnOnPush() {
    await enablePush(vapidPublicKey, subscribePush).catch(() => {});
    remember(null);
    setKind(null);
  }

  if (!kind) return null;
  const Icon = kind === "push" ? Bell : Download;

  const showCta = kind === "push" || !ios;
  return (
    <div className="mx-4 mt-5 flex items-start gap-3 rounded-lg bg-soft p-3.5">
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <span className="text-sm font-semibold">{t(`${kind}.title`)}</span>
        <span className="text-[13px] text-muted-foreground">{t(`${kind}.body`)}</span>
        {showCta ? (
          <Button
            size="sm"
            className="self-start"
            disabled={kind === "install" && !installEvent}
            onClick={async () => {
              if (kind === "push") await turnOnPush();
              else if (installEvent) {
                await installEvent.prompt();
                remember(null);
                setKind(null);
              }
            }}
          >
            {t(`${kind}.cta`)}
          </Button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={tc("close")}
        onClick={dismiss}
        className="flex size-8 items-center justify-center rounded-md hover:bg-background"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
