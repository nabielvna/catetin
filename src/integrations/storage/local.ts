import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Storage } from "@/integrations/storage/types";

export class LocalStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    const p = path.resolve(this.root, key);
    const relative = path.relative(path.resolve(this.root), p);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("bad key");
    }
    return p;
  }
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, data);
  }
  async get(key: string) {
    try {
      return await readFile(this.file(key));
    } catch {
      return null;
    }
  }
  async remove(key: string) {
    await rm(this.file(key), { force: true });
  }
}
