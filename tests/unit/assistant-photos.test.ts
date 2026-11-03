import { convertToModelMessages, generateText, isStepCount, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { forModel, photosIn, RESCAN_MAX, rescanTool } from "@/services/assistant/photos";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const jpeg = (tag: string) => `data:image/jpeg;base64,${Buffer.from(`jpeg-${tag}`).toString("base64")}`;
const photo = (tag: string) => ({ type: "file" as const, mediaType: "image/jpeg", url: jpeg(tag) });
const user = (id: string, ...parts: UIMessage["parts"]): UIMessage => ({ id, role: "user", parts });
const assistant = (id: string, ...parts: UIMessage["parts"]): UIMessage => ({ id, role: "assistant", parts });
const text = (t: string) => ({ type: "text" as const, text: t });

describe("assistant: old photos aren't resent, can be looked at again (rescanPhoto)", () => {
  it("only photos in the latest message with photos are sent; older ones become numbered text; original history intact", () => {
    const history = [
      user("u1", text("struk makan"), photo("a"), photo("b")),
      assistant("a1", text("Warung Sate, 2026-09-28, total 120.000.")),
      user("u2", text("ini struk kopi"), photo("c")),
      assistant("a2", text("Oke.")),
      user("u3", text("Budi juga ikut")),
    ];
    const out = forModel(history);

    expect(out[0]!.parts).toEqual([
      text("struk makan"),
      text('[photo #1: not resent — rescanPhoto({"photo":1}) to see it again]'),
      text('[photo #2: not resent — rescanPhoto({"photo":2}) to see it again]'),
    ]);
    expect(out[2]!.parts).toEqual([text("ini struk kopi"), text("[photo #3]"), photo("c")]);
    expect(out[4]).toBe(history[4]);

    expect(history[0]!.parts).toHaveLength(3);
    expect(photosIn(history).map((p) => p.data.toString())).toEqual(["jpeg-a", "jpeg-b", "jpeg-c"]);
  });

  it("a rescan in this turn sends the original photo to the model; in the next turn it becomes text", async () => {
    let history = [
      user("u1", text("struk"), photo("a")),
      assistant("a1", text("Sudah kubaca.")),
      user("u2", text("struk kedua"), photo("b")),
      assistant("a2", text("Oke.")),
      user("u3", text("yang pertama es tehnya salah deh")),
    ];
    const tools = { rescanPhoto: rescanTool(() => history) };
    const prompts: unknown[] = [];
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (opts) => {
        prompts.push(opts.prompt);
        call++;
        return call === 1
          ? {
              content: [{ type: "tool-call", toolCallId: "r1", toolName: "rescanPhoto", input: '{"photo":1}' }],
              finishReason: { unified: "tool-calls", raw: undefined },
              usage,
              warnings: [],
            }
          : {
              content: [text("Es teh 18.000, kuperbaiki.")],
              finishReason: { unified: "stop", raw: undefined },
              usage,
              warnings: [],
            };
      },
    });
    const result = await generateText({
      model,
      messages: await convertToModelMessages(forModel(history), { tools }),
      tools,
      stopWhen: isStepCount(3),
    });

    const first = JSON.stringify(prompts[0]);
    expect(first).toContain("[photo #1: not resent");
    expect(first).not.toContain(Buffer.from("jpeg-a").toString("base64"));

    const second = JSON.stringify(prompts[1]);
    expect(second).toContain("image/jpeg");
    expect(second).toContain(Buffer.from("jpeg-a").toString("base64"));
    expect(result.steps[0]!.toolResults[0]?.output).toEqual({ ok: true, photo: 1 });

    history = [
      ...history,
      assistant(
        "a3",
        {
          type: "tool-rescanPhoto",
          toolCallId: "r1",
          state: "output-available",
          input: { photo: 1 },
          output: { ok: true, photo: 1 },
        } as never,
        text("Es teh 18.000, kuperbaiki."),
      ),
      user("u4", text("makasih")),
    ];
    const later = JSON.stringify(await convertToModelMessages(forModel(history), { tools }));
    expect(later).toContain("[photo #1 was already looked at again earlier]");
    expect(later).not.toContain(Buffer.from("jpeg-a").toString("base64"));
  });

  it(`max ${RESCAN_MAX} times per chat; nonexistent photo number is rejected`, async () => {
    const past = Array.from({ length: RESCAN_MAX - 1 }, (_, k) => ({
      type: "tool-rescanPhoto",
      toolCallId: `old${k}`,
      state: "output-available",
      input: { photo: 1 },
      output: { ok: true, photo: 1 },
    })) as never[];
    const history = [user("u1", photo("a")), assistant("a1", ...past), user("u2", text("cek lagi"))];
    const t = rescanTool(() => history);
    const run = (photo: number) => t.execute!({ photo }, { toolCallId: `n${photo}`, messages: [] } as never);
    expect(await run(2)).toEqual({ ok: false, error: "not_found" });
    expect(await run(1)).toEqual({ ok: true, photo: 1 });
    expect(await run(1)).toEqual({ ok: false, error: "limit" });
  });
});
