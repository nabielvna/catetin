import "server-only";

import { LocalStorage } from "@/integrations/storage/local";
import { SupabaseStorage } from "@/integrations/storage/supabase";
import type { Storage } from "@/integrations/storage/types";
import { supabaseServerKey } from "@/integrations/supabase/keys";
import { env } from "@/lib/server/env";

export type { Storage } from "@/integrations/storage/types";

let instance: Storage | undefined;
export function storage(): Storage {
  if (instance) return instance;
  const e = env();
  instance =
    e.STORAGE_DRIVER === "supabase"
      ? new SupabaseStorage(e.SUPABASE_URL!, supabaseServerKey()!, e.SUPABASE_STORAGE_BUCKET)
      : new LocalStorage(e.STORAGE_LOCAL_DIR);
  return instance;
}
