import "server-only";

import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: {
    paths: ["email", "*.email", "amount", "*.amount", "title", "*.title", "token", "*.token"],
    censor: "[redacted]",
  },
  base: undefined,
});
