"use client";

import { useEffect } from "react";

import { describeThisDevice } from "@/actions/account";
import { subscribePush } from "@/actions/notifications";
import { syncPush } from "@/integrations/push/client";
import { readClientHints } from "@/lib/device-client";

export function PushSync() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncPush(subscribePush).catch(() => {});
      void readClientHints()
        .then((info) => (info && (info.model || info.browser) ? describeThisDevice(info) : null))
        .catch(() => {});
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
