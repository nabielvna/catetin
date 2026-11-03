import { MockLanguageModelV4 } from "ai/test";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { scanReceipt } from "@/services/scan";

import { makeUser } from "../helpers/factories";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const jpeg = async () =>
  new Uint8Array(
    await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } })
      .jpeg()
      .toBuffer(),
  );

function modelReturning(json: unknown, seen?: { files: number; prompt: string; schema?: string }) {
  return new MockLanguageModelV4({
    doGenerate: async (opts) => {
      if (seen) seen.schema = JSON.stringify((opts.responseFormat as { schema?: unknown } | undefined)?.schema ?? null);
      const parts = opts.prompt[0]!.content as Array<{ type: string; text?: string }>;
      if (seen) {
        seen.files = parts.filter((p) => p.type === "file").length;
        seen.prompt = parts.find((p) => p.type === "text")!.text!;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(json) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

const base = {
  kind: "RECEIPT",
  merchant: "Kopi Kenangan",
  date: "2026-09-28",
  currency: "IDR",
  items: [
    { name: "Kopi Susu", quantity: 2, total: 44000, photo: 1 },
    { name: "Roti", quantity: null, total: 18000, photo: 2 },
  ],
  subtotal: 62000,
  discount: null,
  servicePercent: null,
  serviceAmount: null,
  taxPercent: 10,
  taxAmount: 6200,
  rounding: null,
  total: 68200,
  category: "FOOD",
  method: "EWALLET",
  note: null,
};

describe("receipt scan (D-97)", () => {
  it("several photos sent at once, model output cleaned up", async () => {
    const andi = await makeUser("Andi");
    const seen: { files: number; prompt: string; schema?: string } = { files: 0, prompt: "" };
    const r = await scanReceipt(andi.actor, [await jpeg(), await jpeg()], "bill", "IDR", modelReturning(base, seen));
    expect(seen.files).toBe(2);
    expect(seen.prompt).toContain("split this bill");
    expect(r.items).toEqual([
      { name: "Kopi Susu ×2", amount: 44000, photo: 1 },
      { name: "Roti", amount: 18000, photo: 2 },
    ]);
    expect(seen.prompt).toContain("recorded only ONCE");

    expect(seen.schema).toContain('"photo"');
    expect(seen.schema).not.toContain("9007199254740991");
    expect(seen.schema).not.toContain("maxItems");
    expect(r.taxBps).toBe(1000);
    expect(r.total).toBe(68200);
    expect(r.category).toBe("FOOD");
  });

  it("not an image / too many photos rejected before calling the model", async () => {
    const andi = await makeUser("Andi");
    const model = new MockLanguageModelV4({});
    await expect(scanReceipt(andi.actor, [new Uint8Array(100)], "debt", "IDR", model)).rejects.toMatchObject({
      code: "FILE_REJECTED",
    });
    const p = await jpeg();
    await expect(scanReceipt(andi.actor, [p, p, p, p], "debt", "IDR", model)).rejects.toMatchObject({
      code: "FILE_REJECTED",
    });
    await expect(scanReceipt(andi.actor, [], "debt", "IDR", model)).rejects.toMatchObject({ code: "FILE_REJECTED" });
  });
});
