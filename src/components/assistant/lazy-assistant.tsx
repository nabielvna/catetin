"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { assistantStore } from "@/components/assistant/store";

const Assistant = dynamic(() => import("@/components/assistant/assistant-panel").then((m) => m.Assistant), {
  ssr: false,
});

export function LazyAssistant() {
  const open = assistantStore.useStore((s) => s.open);
  const [ready, setReady] = useState(false);
  if (open && !ready) setReady(true);

  useEffect(() => {
    const peek = () =>
      void fetch("/api/assistant?peek")
        .then((r) => (r.ok ? (r.json() as Promise<{ active: boolean }>) : null))
        .then((d) => {
          if (d?.active) assistantStore.set({ active: true });
        })
        .catch(() => {});
    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(peek, { timeout: 3000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(peek, 1500);
    return () => clearTimeout(id);
  }, []);

  return ready ? <Assistant /> : null;
}
