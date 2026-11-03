"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type VoiceError = { code: string; scope?: "user" | "app"; resetAt?: string };

const MIN_BYTES = 2_000;
const MAX_SECONDS = 60;

export function useVoice({ onText, onError }: { onText: (text: string) => void; onError: (e: VoiceError) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [levels, setLevels] = useState<number[]>(() => Array(24).fill(0.1));
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => () => stopRef.current(), []);

  async function toText(blob: Blob) {
    setState("transcribing");
    try {
      const form = new FormData();
      form.append("audio", blob, "voice");
      const r = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
      const body = (await r.json().catch(() => ({}))) as { text?: string } & Partial<VoiceError>;
      if (!r.ok) return onError({ code: body.code ?? "ASSISTANT_ERROR", scope: body.scope, resetAt: body.resetAt });
      const text = body.text?.trim();
      if (text) onText(text);
      else onError({ code: "VOICE_EMPTY" });
    } catch {
      onError({ code: "NETWORK" });
    } finally {
      setState("idle");
    }
  }

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return onError({ code: "MIC_DENIED" });
    }
    setState("recording");
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setLevels(Array.from({ length: 24 }, (_, i) => Math.max(0.08, (data[i] ?? 0) / 255)));
      raf = requestAnimationFrame(tick);
    };
    tick();

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
      clearTimeout(limit);
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size < MIN_BYTES) {
        setState("idle");
        return onError({ code: "VOICE_EMPTY" });
      }
      void toText(blob);
    };
    recorder.start();
    const limit = setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_SECONDS * 1000);
    stopRef.current = () => recorder.state === "recording" && recorder.stop();
  }

  return {
    active: state === "recording",
    transcribing: state === "transcribing",
    levels,
    start: () => void start(),
    stop: () => stopRef.current(),
  };
}

export function VoiceWave({ levels, transcribing }: { levels: number[]; transcribing: boolean }) {
  const t = useTranslations("assistant");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex h-7 items-center gap-0.75" aria-hidden>
        {levels.map((l, i) => (
          <span
            key={i}
            className={cn(
              "w-1 flex-1 rounded-full bg-ai transition-[height] duration-75",
              transcribing && "opacity-40",
            )}
            style={{ height: `${Math.round((transcribing ? 0.1 : l) * 100)}%` }}
          />
        ))}
      </div>
      <p className="min-h-6 text-base text-muted-foreground" aria-live="polite">
        {transcribing ? t("transcribing") : t("listening")}
      </p>
    </div>
  );
}
