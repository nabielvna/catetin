import { APICallError, generateText, wrapLanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { fallbackOnRateLimit, isTimeout } from "@/integrations/ai/gemini";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const reply = (t: string) => ({
  content: [{ type: "text" as const, text: t }],
  finishReason: { unified: "stop" as const, raw: undefined },
  usage,
  warnings: [],
});
const googleError = (statusCode: number) =>
  new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode, isRetryable: false });

describe("assistant: fallback model when Google rejects (D-102)", () => {
  it("429 on the main model → the same call is retried on the fallback; other errors aren't", async () => {
    let status = 429;
    const primary = new MockLanguageModelV4({
      doGenerate: async () => {
        throw googleError(status);
      },
    });
    const fallback = new MockLanguageModelV4({ modelId: "fallback", doGenerate: async () => reply("from fallback") });
    const model = wrapLanguageModel({ model: primary, middleware: fallbackOnRateLimit(fallback as never) });

    const r = await generateText({ model, prompt: "halo", maxRetries: 0 });
    expect(r.text).toBe("from fallback");
    expect(fallback.doGenerateCalls[0]!.prompt).toEqual(primary.doGenerateCalls[0]!.prompt);

    status = 500;
    await expect(generateText({ model, prompt: "halo", maxRetries: 0 })).rejects.toThrow();
    expect(fallback.doGenerateCalls).toHaveLength(1);
  });

  it("timeouts are recognized (wrapped ones too)", () => {
    expect(isTimeout(new DOMException("t", "TimeoutError"))).toBe(true);
    expect(isTimeout({ lastError: { name: "AbortError" } })).toBe(true);
    expect(isTimeout(new Error("lain"))).toBe(false);
  });
});
