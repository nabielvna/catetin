import "server-only";

import { runCleanup } from "@/jobs/cleanup";
import { log } from "@/lib/server/logger";
import { refreshFxRates } from "@/services/currencies";
export async function runDaily() {
  const fx = await refreshFxRates().catch((err) => {
    log.error({ err }, "fx refresh failed");
    return null;
  });
  await runCleanup();
  return { fx };
}
