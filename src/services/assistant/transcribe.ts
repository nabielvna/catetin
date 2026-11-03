import "server-only";

import { generateText, type LanguageModel } from "ai";

import { DomainError } from "@/domain/errors";
import { contactsFor } from "@/services/assistant/context";
import type { Actor } from "@/services/context";

export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/wav",
  "audio/x-m4a",
]);

export function audioType(mime: string): string | null {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  return AUDIO_TYPES.has(base) ? base : null;
}

export async function transcribe(actor: Actor, audio: Uint8Array, mime: string, model: LanguageModel): Promise<string> {
  const mediaType = audioType(mime);
  if (!mediaType || audio.length === 0 || audio.length > MAX_AUDIO_BYTES) throw new DomainError("FILE_REJECTED");
  const names = (await contactsFor(actor)).slice(0, 60).map((c) => c.name);
  const prompt = [
    "Transcribe exactly what is said in this recording, in its original language.",
    "The speaker may mix Indonesian and English in one sentence: write it as-is, do not translate.",
    "Write amounts briefly as spoken (e.g. gocap, 50rb, 1,5jt, twenty thousand).",
    names.length ? `Names that may be mentioned: ${[actor.name, ...names].join(", ")}.` : "",
    "Reply with only the transcript text, no comments. If there's no clear speech, reply with nothing.",
  ]
    .filter(Boolean)
    .join("\n");
  const { text } = await generateText({
    model,
    temperature: 0,
    maxOutputTokens: 400,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "file", mediaType, data: audio },
        ],
      },
    ],
  });
  return text
    .trim()
    .replace(/^["“]|["”]$/g, "")
    .trim();
}
