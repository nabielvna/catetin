import "server-only";

import { z } from "zod";

import { FX_PROVIDERS } from "@/integrations/currencies/types";

const isProd = process.env.NODE_ENV === "production";

const DEV_ALLOWED_HOSTS = "localhost:*,127.0.0.1:*,*.ngrok-free.app,*.ngrok-free.dev,*.ngrok.app,*.trycloudflare.com";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));
const requiredInProd = (devDefault?: string) =>
  isProd
    ? z.string().min(1)
    : z
        .string()
        .min(1)
        .default(devDefault ?? "dev-only");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url(),

    DATABASE_URL_DIRECT: optional,

    FX_PROVIDER: optional.pipe(z.enum(FX_PROVIDERS).default("exchangerate-api")),
    FX_FALLBACK_PROVIDER: optional.pipe(z.enum([...FX_PROVIDERS, "none"]).default("frankfurter")),

    APP_URL: z.url().default("http://localhost:3000"),

    APP_ALLOWED_HOSTS: z
      .string()
      .optional()
      .transform((v) =>
        (v?.trim() ? v : isProd ? "" : DEV_ALLOWED_HOSTS)
          .split(",")
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean),
      ),
    BETTER_AUTH_SECRET: requiredInProd("dev-secret-change-me-dev-secret-change-me"),

    GOOGLE_CLIENT_ID: optional,
    GOOGLE_CLIENT_SECRET: optional,

    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().default(1026),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    SMTP_USER: optional,
    SMTP_PASS: optional,
    SMTP_FROM_NAME: z.string().default("Catetin"),
    SMTP_FROM_EMAIL: z.email().default("no-reply@catetin.local"),

    CRON_SECRET: requiredInProd("dev-cron-secret"),

    SIGNING_SECRET: requiredInProd("dev-signing-secret"),

    VAPID_PUBLIC_KEY: optional,
    VAPID_PRIVATE_KEY: optional,
    VAPID_SUBJECT: optional,

    GEMINI_API_KEY: optional,

    GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),

    GEMINI_FALLBACK_MODEL: z.string().default("gemini-3.5-flash"),

    ASSISTANT_USER_MESSAGES_PER_DAY: z.coerce.number().int().positive().default(15),
    ASSISTANT_USER_CALLS_PER_DAY: z.coerce.number().int().positive().default(60),
    ASSISTANT_APP_CALLS_PER_DAY: z.coerce.number().int().positive().default(450),

    STORAGE_DRIVER: z.enum(["local", "supabase"]).default("local"),
    STORAGE_LOCAL_DIR: z.string().default(".data/files"),
    SUPABASE_URL: optional,

    SUPABASE_SECRET_KEY: optional,
    SUPABASE_SERVICE_ROLE_KEY: optional,

    SUPABASE_PUBLISHABLE_KEY: optional,
    SUPABASE_ANON_KEY: optional,

    SUPABASE_JWT_PRIVATE_KEY: optional,

    SUPABASE_JWT_SECRET: optional,
    SUPABASE_STORAGE_BUCKET: z.string().default("files"),

    REALTIME_DRIVER: z.enum(["pg", "supabase", "none"]).default("pg"),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  })
  .superRefine((config, ctx) => {
    if (config.STORAGE_DRIVER !== "supabase") return;
    if (!config.SUPABASE_URL || !z.url({ protocol: /^https?$/ }).safeParse(config.SUPABASE_URL).success) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_URL"],
        message: "A valid HTTP(S) URL is required when STORAGE_DRIVER=supabase",
      });
    }
    if (!config.SUPABASE_SECRET_KEY && !config.SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPABASE_SECRET_KEY"],
        message: "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required when STORAGE_DRIVER=supabase",
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
