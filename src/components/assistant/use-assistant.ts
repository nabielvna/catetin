"use client";
import { type Chat, useChat } from "@ai-sdk/react";
import type { FileUIPart, UIMessage } from "ai";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { lastPhoto, type Loaded, session } from "@/components/assistant/session";
import { canSpeak, speak, speech, stopSpeaking, subscribeVoices } from "@/components/assistant/speech";
import { assistantStore } from "@/components/assistant/store";
import { useVoice } from "@/components/assistant/voice";
import { photoToDataUrl, releasePhotos, type ScanPhoto } from "@/components/scan/photo";
import { useRouter } from "@/i18n/navigation";
import { type ChatLang, detectLang } from "@/lib/detect-language";
export function useAssistant({ chat, data }: { chat: Chat<UIMessage>; data: Loaded }) {
  const t = useTranslations("assistant");
  const te = useTranslations("errors");
  const router = useRouter();
  const input = session.useStore((s) => s.draft);
  const setInput = (draft: string) => session.set({ draft });
  const quota = session.useStore((s) => s.quota);
  const notice = session.useStore((s) => s.notice);
  const intent = assistantStore.useStore((s) => s.intent);
  const format = useFormatter();
  const locked = !data.enabled || (quota !== null && new Date(quota.resetAt) > new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, addToolOutput, addToolApprovalResponse, status, error } = useChat({ chat });

  const chatPhoto = lastPhoto(messages);
  const locale = useLocale();

  const chatLang = lastUserLang(messages) ?? (locale === "en" ? "en" : "id");
  const speaking = speech.useStore((s) => s.speaking);
  const autoSpeak = speech.useStore((s) => s.auto);
  const voiceOk = useSyncExternalStore(subscribeVoices, canSpeak, () => false);

  const viaVoice = useRef(false);
  const prevStatus = useRef(status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (status !== "ready" || (was !== "streaming" && was !== "submitted")) return;
    if (!viaVoice.current || !speech.get().auto) return;
    const last = messages.at(-1);
    if (last?.role === "assistant") speak(last.id, textOf(last), detectLang(textOf(last)) ?? chatLang);
  }, [status, messages, chatLang]);
  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const hasMessages = messages.length > 0;
  const voice = useVoice({
    onText: (txt) => send(txt, undefined, true),
    onError: (e) => {
      if (e.code === "ASSISTANT_QUOTA" && e.scope && e.resetAt)
        return session.set({ quota: { scope: e.scope, resetAt: e.resetAt } });
      session.set({
        notice:
          e.code === "ASSISTANT_BUSY"
            ? "busy"
            : e.code === "VOICE_EMPTY"
              ? "voiceEmpty"
              : e.code === "MIC_DENIED"
                ? "micDenied"
                : "voiceFailed",
      });
    },
  });
  const recording = voice.active || voice.transcribing;
  const busy = status === "submitted" || status === "streaming";

  const startVoice = voice.start;
  useEffect(() => {
    if (!intent) return;
    assistantStore.set({ intent: null });
    if (locked) return;
    if (intent === "voice") startVoice();
    else textarea.current?.focus();
  }, [intent, locked, startVoice]);

  const sendLock = useRef(false);
  useEffect(() => {
    sendLock.current = false;
  }, [status]);
  function send(text: string, files?: FileUIPart[], spoken = false) {
    if (!text.trim() && !files?.length) return;
    if (busy || sendLock.current) return;
    sendLock.current = true;
    viaVoice.current = spoken;
    stopSpeaking();
    session.set({ notice: null });
    void sendMessage({ text: text.trim(), files });
    setInput("");
  }

  const [camera, setCamera] = useState(false);
  async function sendPhotos(photos: ScanPhoto[]) {
    const files = await Promise.all(
      photos.map(async (p, i) => ({
        type: "file" as const,
        mediaType: "image/jpeg",
        url: await photoToDataUrl(p),
        filename: `struk-${i + 1}.jpg`,
      })),
    );
    releasePhotos(photos);
    send(RECEIPT_PROMPT[chatLang], files);
  }

  const lastFindQuery = (): string | null => {
    for (let i = messages.length - 1; i >= 0; i--) {
      for (const p of [...messages[i]!.parts].reverse()) {
        if (p.type === "tool-findPerson")
          return ((p as unknown as { input?: { name?: string } }).input?.name ?? null) as string | null;
      }
    }
    return null;
  };

  return {
    t,
    te,
    router,
    input,
    setInput,
    quota,
    notice,
    format,
    locked,
    scroller,
    textarea,
    messages,
    addToolOutput,
    addToolApprovalResponse,
    status,
    error,
    chatPhoto,
    chatLang,
    speaking,
    autoSpeak,
    voiceOk,
    hasMessages,
    voice,
    recording,
    busy,
    send,
    camera,
    setCamera,
    sendPhotos,
    lastFindQuery,
    data,
  };
}
const RECEIPT_PROMPT: Record<ChatLang, string> = {
  id: "Ini foto struk. Tolong buat split bill-nya.",
  en: "Here's a receipt. Please split this bill.",
};
function lastUserLang(messages: UIMessage[]): ChatLang | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    const lang = detectLang(textOf(m));
    if (lang) return lang;
  }
  return null;
}
export function textOf(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim();
}
export type AssistantController = ReturnType<typeof useAssistant>;
