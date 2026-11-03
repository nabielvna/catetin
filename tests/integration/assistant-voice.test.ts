import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { audioType, transcribe } from "@/services/assistant/transcribe";

import { connected, makeUser, manual } from "../helpers/factories";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("assistant: voice messages via Gemini (D-94)", () => {
  it("the recording is sent as-is + name hints; mixed language isn't translated", async () => {
    const andi = await makeUser("Andi");
    const shinta = await makeUser("Shinta Dewi");
    await connected(andi, shinta);
    await manual(andi, "Budi Santoso");
    let sent: { prompt: string; mediaType: string } | null = null;
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        const parts = opts.prompt[0]!.content as Array<{
          type: string;
          text?: string;
          mediaType?: string;
          data?: unknown;
        }>;
        const file = parts.find((p) => p.type === "file")!;
        sent = { prompt: parts.find((p) => p.type === "text")!.text!, mediaType: file.mediaType! };
        return {
          content: [{ type: "text", text: '"Tolong catat, Budi utang gocap for lunch."' }],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        };
      },
    });
    const text = await transcribe(andi.actor, new Uint8Array(3000), "audio/webm;codecs=opus", model);
    expect(text).toBe("Tolong catat, Budi utang gocap for lunch.");
    expect(sent!.mediaType).toBe("audio/webm");
    expect(sent!.prompt).toContain("do not translate");
    expect(sent!.prompt).toContain("Shinta Dewi");
    expect(sent!.prompt).toContain("Budi Santoso");
  });

  it("only supported audio, size limited", async () => {
    expect(audioType("audio/mp4")).toBe("audio/mp4");
    expect(audioType("image/png")).toBeNull();
    const andi = await makeUser("Andi");
    const model = new MockLanguageModelV4({});
    await expect(transcribe(andi.actor, new Uint8Array(10), "image/png", model)).rejects.toMatchObject({
      code: "FILE_REJECTED",
    });
    await expect(transcribe(andi.actor, new Uint8Array(0), "audio/webm", model)).rejects.toMatchObject({
      code: "FILE_REJECTED",
    });
  });
});
