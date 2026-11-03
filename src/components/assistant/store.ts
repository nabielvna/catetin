"use client";

import { createStore } from "@/lib/store";

export type LaunchIntent = "type" | "voice";

export const assistantStore = createStore<{ open: boolean; active: boolean; intent: LaunchIntent | null }>({
  open: false,
  active: false,
  intent: null,
});
export const openAssistant = (intent: LaunchIntent | null = null) => assistantStore.set({ open: true, intent });
