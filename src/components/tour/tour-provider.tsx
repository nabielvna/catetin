"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import { startTour, TOUR_EVENT, tourStore } from "@/components/tour/store";
import { isTourId, type TourParams } from "@/lib/tours";

const TourOverlay = dynamic(() => import("@/components/tour/tour-overlay").then((m) => m.TourOverlay), { ssr: false });

export function TourHost() {
  const on = tourStore.useStore((s) => s.active !== null || s.done !== null);

  useEffect(() => {
    const onStart = (e: Event) => {
      const d = (e as CustomEvent<{ id?: unknown; params?: TourParams; vars?: Record<string, string> }>).detail;
      if (isTourId(d?.id)) startTour({ id: d.id, params: d.params ?? {}, vars: d.vars ?? {} });
    };
    window.addEventListener(TOUR_EVENT, onStart);
    return () => window.removeEventListener(TOUR_EVENT, onStart);
  }, []);

  return on ? <TourOverlay /> : null;
}
