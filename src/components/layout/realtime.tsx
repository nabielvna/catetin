"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { subscribeChanges } from "@/integrations/realtime/client";

export function RealtimeRefresher() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    const disconnect = subscribeChanges(refresh);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    window.addEventListener("catetin:refresh", refresh);
    return () => {
      disconnect();
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      window.removeEventListener("catetin:refresh", refresh);
    };
  }, [router]);

  return null;
}
