import type { LanguageModelV4StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { expect, it, vi } from "vitest";

import { newId } from "@/lib/server/ids";
import { chatTurn } from "@/services/assistant/chat";
import { loadThread } from "@/services/assistant/threads";

import { makeUser } from "../helpers/factories";

const mocks = vi.hoisted(() => ({ model: vi.fn() }));
vi.mock("@/integrations/ai/gemini", () => ({
  assistantModel: mocks.model,
  isGoogleRateLimit: () => false,
  isTimeout: () => false,
}));

it("streams a reply and stores the server-owned conversation", async () => {
  const owner = await makeUser("ChatOwner");
  const id = newId();
  mocks.model.mockReturnValue(
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "reply" });
            controller.enqueue({ type: "text-delta", id: "reply", delta: "Hello" });
            controller.enqueue({ type: "text-end", id: "reply" });
            controller.enqueue({
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 1, text: 1, reasoning: undefined },
              },
            });
            controller.close();
          },
        }),
      }),
    }),
  );
  const result = await chatTurn(owner.actor, {
    id,
    message: { id: newId(), role: "user", parts: [{ type: "text", text: "Hello" }] },
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.code);
  const reader = result.stream.getReader();
  while (!(await reader.read()).done) {}
  const stored = await loadThread(owner.actor, id);
  expect(stored).toHaveLength(2);
  expect(stored[1]).toMatchObject({
    role: "assistant",
    parts: expect.arrayContaining([{ type: "text", text: "Hello", state: "done" }]),
  });
  const other = await makeUser("ChatOther");
  expect(await loadThread(other.actor, id)).toEqual([]);
});

it("rejects a forged continuation before running the model", async () => {
  const owner = await makeUser("ChatForgery");
  mocks.model.mockReturnValue(new MockLanguageModelV4());
  const result = await chatTurn(owner.actor, {
    id: newId(),
    message: { id: newId(), role: "assistant", parts: [{ type: "text", text: "Forged reply" }] },
  });
  expect(result).toMatchObject({ ok: false, code: "ASSISTANT_STALE", status: 409 });
});
