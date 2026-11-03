"use client";

import { createStore } from "@/lib/store";

export const speech = createStore<{ speaking: string | null; auto: boolean }>({ speaking: null, auto: readAuto() });

const AUTO_KEY = "catetin:assistant-voice-reply";

function readAuto(): boolean {
  try {
    return typeof window === "undefined" ? true : window.localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setAutoSpeak(on: boolean) {
  speech.set({ auto: on });
  try {
    window.localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {}
  if (!on) stopSpeaking();
}

export function canSpeak(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window &&
    window.speechSynthesis.getVoices().length > 0
  );
}

export function subscribeVoices(cb: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", cb);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", cb);
}

export function speakable(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>~]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  return (
    voices.find((v) => v.lang.replace("_", "-") === lang && v.localService) ??
    voices.find((v) => v.lang.replace("_", "-") === lang) ??
    voices.find((v) => v.lang.startsWith(base))
  );
}

export function speak(id: string, text: string, lang: "id" | "en") {
  if (!canSpeak()) return;
  const clean = speakable(text);
  if (!clean) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const bcp47 = lang === "en" ? "en-US" : "id-ID";

  const parts = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  const voice = pickVoice(bcp47);
  parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p.trim());
    u.lang = bcp47;
    if (voice) u.voice = voice;
    u.rate = 1.05;
    if (i === 0) u.onstart = () => speech.set({ speaking: id });
    if (i === parts.length - 1) {
      u.onend = () => speech.get().speaking === id && speech.set({ speaking: null });
      u.onerror = u.onend;
    }
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
  speech.set({ speaking: null });
}
