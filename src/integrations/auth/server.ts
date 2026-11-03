import "server-only";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";

import { db } from "@/database/client";
import { account, authRateLimit, session, user, verification } from "@/database/schema/index";
import { messagesFor } from "@/i18n/messages";
import { LOCALE_COOKIE } from "@/i18n/routing";
import { sendMail } from "@/integrations/email/send";
import { otpEmail } from "@/integrations/email/templates/otp";
import { allowedHosts } from "@/lib/server/app-url";
import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";

export type AuthLifecycle = {
  afterUserCreated(user: { id: string; name: string; email: string }): Promise<void>;
  afterSessionCreated(id: string, userId: string, headers: Headers | null | undefined): Promise<void>;
  loadAccount(userId: string): Promise<{ onboarded: boolean; locale: "id" | "en" } | null>;
};

export function createAuth(lifecycle: AuthLifecycle) {
  const e = env();
  const google =
    e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: e.GOOGLE_CLIENT_ID,
            clientSecret: e.GOOGLE_CLIENT_SECRET,
            prompt: "select_account" as const,
          },
        }
      : undefined;

  return betterAuth({
    appName: "Catetin",

    baseURL: e.APP_ALLOWED_HOSTS.length ? { allowedHosts: allowedHosts(), fallback: e.APP_URL } : e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification, rateLimit: authRateLimit },
    }),
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: e.NODE_ENV === "production",

      trustedProxyHeaders: e.APP_ALLOWED_HOSTS.length > 0,
    },

    user: {
      additionalFields: {
        locale: { type: "string", required: false, defaultValue: "id", input: false },
        onboardedAt: { type: "date", required: false, input: false },
      },
    },

    session: { expiresIn: 60 * 60 * 24 * 60, updateAge: 60 * 60 * 24, cookieCache: { enabled: true, maxAge: 5 * 60 } },

    account: { accountLinking: { enabled: true } },
    socialProviders: google,
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 10 },
        "/sign-in/email-otp": { window: 60, max: 10 },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const s = ctx.context.newSession;
        if (!s) return;
        const actor = await lifecycle.loadAccount(s.user.id);
        if (!actor?.onboarded) return;
        const { name, ...attrs } = LOCALE_COOKIE;
        ctx.setCookie(name, actor.locale, { ...attrs, path: "/", httpOnly: false });
      }),
    },
    databaseHooks: {
      session: {
        create: {
          async after(s, ctx) {
            await lifecycle
              .afterSessionCreated(s.id, s.userId, ctx?.headers ?? ctx?.request?.headers)
              .catch((err) => log.error({ err }, "session location failed"));
          },
        },
      },
      user: {
        create: {
          async after(u) {
            await lifecycle.afterUserCreated({ id: u.id, name: u.name, email: u.email });
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        rateLimit: { window: 60, max: 10 },
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp }, ctx) {
          const locale = ctx?.request?.headers.get("x-catetin-locale") === "en" ? "en" : "id";
          const t = messagesFor(locale).email.otp;
          if (e.NODE_ENV !== "production") log.info({ otp }, "[dev] kode OTP");
          const mail = await otpEmail(otp, t);

          void sendMail({ to: email, ...mail }).catch((err) => log.error({ err }, "otp email failed"));
        },
      }),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const googleEnabled = () => Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);
