import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { attachFile, listAttachments, readFileFor, removeAttachment, uploadImage } from "@/services/files";

import { connected, debt, makeUser, record } from "../helpers/factories";

async function jpegWithExif() {
  return sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#888" } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "secret-gps" } } })
    .toBuffer();
}

describe("proof photos", () => {
  it("converted to WebP, downscaled, metadata stripped", async () => {
    const andi = await makeUser("Andi");
    const { id } = await uploadImage(andi.actor, await jpegWithExif());
    const data = (await readFileFor(andi.actor, id))!;
    const meta = await sharp(data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(2000);
    expect(meta.exif).toBeUndefined();
  });

  it("non-image files are rejected", async () => {
    const andi = await makeUser("Andi");
    await expect(uploadImage(andi.actor, Buffer.from("<script>alert(1)</script>"))).rejects.toMatchObject({
      code: "FILE_REJECTED",
    });
  });

  it("only involved parties can view; once active it's only hidden", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    const citra = await makeUser("Citra");
    await connected(andi, budi);
    const d = await record(budi, debt(andi, budi, 10_000));
    const { id: fileId } = await uploadImage(andi.actor, await jpegWithExif());
    const a = await attachFile(andi, { fileId, target: { type: "OBLIGATION", id: d.id } });
    expect(await readFileFor(budi.actor, fileId)).not.toBeNull();
    expect(await readFileFor(citra.actor, fileId)).toBeNull();
    await expect(attachFile(citra, { fileId, target: { type: "OBLIGATION", id: d.id } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await removeAttachment(andi, { attachmentId: a.id });
    const list = await listAttachments(budi.actor, { type: "OBLIGATION", id: d.id });
    expect(list).toHaveLength(1);
    expect(list[0]!.hidden).toBe(true);
    expect(await readFileFor(budi.actor, fileId)).toBeNull();
  });
});
