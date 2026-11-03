"use client";

import { useEffect } from "react";

const EDITABLE = "input, textarea, [contenteditable]:not([contenteditable='false'])";

export function NoContextMenu() {
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest(EDITABLE)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);
  return null;
}
