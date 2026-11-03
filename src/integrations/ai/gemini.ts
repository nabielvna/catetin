import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { APICallError, type LanguageModel, type LanguageModelMiddleware, wrapLanguageModel } from "ai";

import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";

export function assistantModel(): LanguageModel | null {
  const e = env();
  if (!e.GEMINI_API_KEY) return null;
  const google = createGoogleGenerativeAI({ apiKey: e.GEMINI_API_KEY });
  const primary = google(e.GEMINI_MODEL);
  const fallbackId = e.GEMINI_FALLBACK_MODEL;
  if (!fallbackId || fallbackId === "none" || fallbackId === e.GEMINI_MODEL) return primary;
  return wrapLanguageModel({ model: primary, middleware: fallbackOnRateLimit(google(fallbackId)) });
}

type Fallback = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;

export function fallbackOnRateLimit(fallback: Fallback): LanguageModelMiddleware {
  const retry = <T>(e: unknown, run: () => PromiseLike<T>) => {
    if (!isGoogleRateLimit(e)) throw e;
    log.warn({ model: fallback.modelId }, "assistant primary model rate-limited, using fallback");
    return run();
  };
  return {
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (e) {
        return retry(e, () => fallback.doGenerate(params));
      }
    },
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (e) {
        return retry(e, () => fallback.doStream(params));
      }
    },
  };
}

export function isGoogleRateLimit(error: unknown): boolean {
  let e = error;
  for (let depth = 0; e && depth < 5; depth++) {
    if (APICallError.isInstance(e) && e.statusCode === 429) return true;
    const next = e as { lastError?: unknown; cause?: unknown };
    e = next.lastError ?? next.cause;
  }
  return false;
}

export function isTimeout(error: unknown): boolean {
  let e = error;
  for (let depth = 0; e && depth < 5; depth++) {
    const name = (e as { name?: string }).name;
    if (name === "TimeoutError" || name === "AbortError") return true;
    const next = e as { lastError?: unknown; cause?: unknown };
    e = next.lastError ?? next.cause;
  }
  return false;
}
