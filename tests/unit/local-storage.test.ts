import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LocalStorage } from "@/integrations/storage/local";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "catetin-storage-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("local storage", () => {
  it("stores nested files and removes them", async () => {
    const storage = new LocalStorage(root);
    await storage.put("nested/photo.webp", Buffer.from("photo"));
    expect(await storage.get("nested/photo.webp")).toEqual(Buffer.from("photo"));
    await storage.remove("nested/photo.webp");
    expect(await storage.get("nested/photo.webp")).toBeNull();
  });

  it.each(["../escape", "../%ROOT%-sibling/file", "", "."])("rejects paths outside the file root: %s", async (key) => {
    const storage = new LocalStorage(root);
    const resolved = key.replace("%ROOT%", path.basename(root));
    await expect(storage.put(resolved, Buffer.from("bad"))).rejects.toThrow("bad key");
    await expect(storage.remove(resolved)).rejects.toThrow("bad key");
  });

  it("does not treat a sibling sharing the root prefix as a child", async () => {
    const sibling = `${root}-sibling`;
    await new LocalStorage(sibling).put("photo", Buffer.from("keep"));
    try {
      const storage = new LocalStorage(root);
      await expect(storage.put(`${sibling}/photo`, Buffer.from("overwrite"))).rejects.toThrow("bad key");
      expect(await readFile(path.join(sibling, "photo"))).toEqual(Buffer.from("keep"));
    } finally {
      await rm(sibling, { recursive: true, force: true });
    }
  });
});
