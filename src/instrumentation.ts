import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (error) => {
  const { log } = await import("@/lib/server/logger");
  log.error({ err: error }, "request failed");
};
