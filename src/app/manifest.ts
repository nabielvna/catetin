import type { MetadataRoute } from "next";

import { messagesFor } from "@/i18n/messages";
import { routing } from "@/i18n/routing";

export default function manifest(): MetadataRoute.Manifest {
  const t = messagesFor(routing.defaultLocale).manifest;
  return {
    name: "Catetin",
    short_name: "Catetin",
    description: t.description,
    start_url: "/home",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: routing.defaultLocale,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t.shortcuts.debt, url: "/debts/new", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: t.shortcuts.bill, url: "/bills/new", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
