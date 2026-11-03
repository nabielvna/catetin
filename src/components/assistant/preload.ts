"use client";

export const preloadAssistant = () => void import("@/components/assistant/assistant-panel");
export const preloadHandlers = {
  onPointerEnter: preloadAssistant,
  onPointerDown: preloadAssistant,
  onFocus: preloadAssistant,
};
