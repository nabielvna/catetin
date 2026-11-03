"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";

import { NoContextMenu } from "@/components/layout/no-context-menu";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { Toaster } from "@/components/ui/sonner";

let hydrated = false;

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    hydrated = true;
  }, []);
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={hydrated ? { type: "text/plain" } : undefined}
    >
      {children}
      <Toaster position="top-center" />
      <ServiceWorkerRegister />
      <NoContextMenu />
    </ThemeProvider>
  );
}
