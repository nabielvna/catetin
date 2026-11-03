"use client";

import { ArrowUp, Loader2, Mic, Plus, Square } from "lucide-react";
import dynamic from "next/dynamic";

import { type AssistantController } from "@/components/assistant/use-assistant";
import { VoiceWave } from "@/components/assistant/voice";
const loadCamera = () => import("@/components/scan/scan-dialog");
const ScanFlow = dynamic(loadCamera, { ssr: false });
export function MessageInput({ controller }: { controller: AssistantController }) {
  const { t, input, setInput, locked, textarea, voice, recording, busy, send, camera, setCamera, sendPhotos } =
    controller;
  return (
    <div className="shrink-0 px-3 pt-1 pb-3">
      <form
        className="flex flex-col rounded-3xl border border-border bg-soft px-2 pt-1.5 pb-1.5 transition-colors focus-within:border-muted-foreground/50"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {recording ? (
          <div className="flex px-2.5 pt-2 pb-1">
            <VoiceWave levels={voice.levels} transcribing={voice.transcribing} />
          </div>
        ) : (
          <textarea
            ref={textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            className="field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-2.5 py-2.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            disabled={locked}
          />
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={t("photo")}
            title={t("photo")}
            disabled={busy || locked || recording}
            onClick={() => setCamera(true)}
            onPointerEnter={() => void loadCamera()}
            className="flex size-10 items-center justify-center rounded-full hover:bg-foreground/5 disabled:opacity-40"
          >
            <Plus className="size-5" strokeWidth={1.8} />
          </button>
          <div className="flex items-center gap-1">
            {recording ? (
              <button
                type="button"
                aria-label={t("voiceStop")}
                onClick={voice.stop}
                disabled={voice.transcribing}
                className="flex size-10 items-center justify-center rounded-full bg-ai text-white disabled:opacity-60"
              >
                {voice.transcribing ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Square className="size-4" fill="currentColor" />
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={t("voice")}
                  title={t("voice")}
                  disabled={busy || locked}
                  onClick={voice.start}
                  className="flex size-10 items-center justify-center rounded-full hover:bg-foreground/5 disabled:opacity-40"
                >
                  <Mic className="size-5" strokeWidth={1.8} />
                </button>
                <button
                  type="submit"
                  aria-label={t("send")}
                  disabled={busy || locked || !input.trim()}
                  className="flex size-10 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-25"
                >
                  {busy ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ArrowUp className="size-5" strokeWidth={2.2} />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </form>
      {camera ? (
        <ScanFlow purpose="capture" onClose={() => setCamera(false)} onPhotos={(p) => void sendPhotos(p)} />
      ) : null}
    </div>
  );
}
