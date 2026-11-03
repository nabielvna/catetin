import "server-only";

import type { Storage } from "@/integrations/storage/types";
import { supabaseHeaders } from "@/integrations/supabase/keys";

export class SupabaseStorage implements Storage {
  constructor(
    private url: string,
    private key: string,
    private bucket: string,
  ) {}
  private endpoint(key: string) {
    return `${this.url}/storage/v1/object/${this.bucket}/${key}`;
  }
  private headers(extra: Record<string, string> = {}) {
    return supabaseHeaders(this.key, extra);
  }
  async put(key: string, data: Buffer, contentType: string) {
    const res = await fetch(this.endpoint(key), {
      method: "POST",
      headers: this.headers({ "content-type": contentType, "x-upsert": "false" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`storage put ${res.status}`);
  }
  async get(key: string) {
    const res = await fetch(this.endpoint(key), { headers: this.headers() });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  async remove(key: string) {
    await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
      method: "DELETE",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    });
  }
}
