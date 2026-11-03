"use client";
import { type Chat, useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { ChevronDown, Loader2, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { useEffect } from "react";

import { MessageInput } from "@/components/assistant/message-input";
import { MessageList } from "@/components/assistant/message-list";
import {
  endSession,
  handlers,
  type Loaded,
  loadSession,
  session,
  setCurrentPath,
} from "@/components/assistant/session";
import { setAutoSpeak } from "@/components/assistant/speech";
import { assistantStore } from "@/components/assistant/store";
import { useAssistant } from "@/components/assistant/use-assistant";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function Assistant() {
  const open = assistantStore.useStore((s) => s.open);
  const chat = session.useStore((s) => s.chat);
  const data = session.useStore((s) => s.data);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    handlers.navigate = (path) => router.push(path);
  }, [router]);
  useEffect(() => setCurrentPath(pathname), [pathname]);

  useEffect(() => {
    if (open) {
      void loadSession();
      return;
    }
    const timer = window.setTimeout(() => void loadSession(), 2000);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <>
      {chat ? <ActiveSync chat={chat} /> : null}
      <Drawer open={open} onOpenChange={(o) => assistantStore.set({ open: o })}>
        <DrawerContent className="no-print h-[85dvh] bg-background md:h-[70dvh]">
          {chat && data ? (
            <ChatPanel chat={chat} data={data} />
          ) : (
            <>
              <DrawerTitle className="sr-only">Asisten</DrawerTitle>
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="animate-spin" />
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

function ActiveSync({ chat }: { chat: Chat<UIMessage> }) {
  const { messages } = useChat({ chat });
  const has = messages.length > 0;
  useEffect(() => {
    assistantStore.set({ active: has });
  }, [has]);
  return null;
}

function ChatPanel({ chat, data }: { chat: Chat<UIMessage>; data: Loaded }) {
  const controller = useAssistant({ chat, data });
  const { t, autoSpeak, voiceOk, hasMessages } = controller;
  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between px-3">
        <DrawerTitle className="flex items-center gap-2 pl-1 text-[15px] font-semibold tracking-normal">
          <Sparkles className={cn("size-4.5", hasMessages && "text-ai")} fill={hasMessages ? "currentColor" : "none"} />
          {t("title")}
        </DrawerTitle>
        <div className="flex items-center gap-1">
          {voiceOk ? (
            <button
              type="button"
              aria-pressed={autoSpeak}
              aria-label={t("autoSpeak")}
              title={t("autoSpeak")}
              className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-soft hover:text-foreground"
              onClick={() => setAutoSpeak(!autoSpeak)}
            >
              {autoSpeak ? <Volume2 className="size-4.5" /> : <VolumeX className="size-4.5" />}
            </button>
          ) : null}
          {hasMessages ? (
            <button
              type="button"
              className="h-9 rounded-full px-3.5 text-[13px] font-semibold text-muted-foreground hover:bg-soft hover:text-foreground"
              onClick={() => void endSession()}
            >
              {t("done")}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={hasMessages ? t("minimize") : t("close")}
            className="flex size-9 items-center justify-center rounded-full hover:bg-soft"
            onClick={() => assistantStore.set({ open: false })}
          >
            {hasMessages ? <ChevronDown className="size-5" /> : <X className="size-5" />}
          </button>
        </div>
      </header>

      <MessageList controller={controller} />

      <MessageInput controller={controller} />
    </>
  );
}
