import "server-only";

import { z } from "zod";

import { isValidTimezone } from "@/domain/dates";
import { DomainError } from "@/domain/errors";
import { updateProfile } from "@/services/account/profile";
import { getSettings, setDigestFrequency, setPref } from "@/services/account/settings";
import { need, reviewOnly } from "@/services/assistant/operations/helpers";
import { currencyCode } from "@/services/assistant/operations/schemas";
import { type Op } from "@/services/assistant/operations/types";

export const updateSettingsInput = z.object({
  action: z
    .enum(["PROFILE", "NOTIFICATION", "DIGEST", "QUIET_HOURS", "FEEDBACK"])
    .describe(
      "PROFILE name/language/default currency/time zone; NOTIFICATION turn one notification type on/off; DIGEST email digest; QUIET_HOURS quiet hours; FEEDBACK send feedback to the app makers",
    ),
  name: z.string().min(1).max(60).optional(),
  locale: z.enum(["id", "en"]).optional(),
  currency: currencyCode.optional(),
  timezone: z.string().max(64).optional().describe("e.g. Asia/Jakarta"),
  topic: z
    .enum(["ACTION", "INFO", "REMINDER"])
    .optional()
    .describe("NOTIFICATION: ACTION = needs my action, INFO = news, REMINDER = due-date reminders"),
  channel: z.enum(["PUSH", "EMAIL"]).optional(),
  enabled: z.boolean().optional(),
  digest: z.enum(["WEEKLY", "DAILY", "OFF"]).optional(),
  quietStart: z.number().int().min(0).max(23).optional().describe("jam mulai (0–23)"),
  quietEnd: z.number().int().min(0).max(23).optional().describe("jam selesai (0–23)"),
  message: z.string().min(1).max(5000).optional().describe("FEEDBACK: feedback content"),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsInput>;

export const updateSettings: Op<UpdateSettingsInput> = {
  review(i) {
    if (i.action === "PROFILE" && i.name !== undefined) return { form: "/account", view: "/account" };
    if (i.action === "FEEDBACK") return { form: "/account" };
    if (i.action === "QUIET_HOURS") return { form: "/account/notifications", view: "/account/notifications" };
    return null;
  },

  async preview(i, env) {
    const { t } = env;
    switch (i.action) {
      case "PROFILE": {
        if (i.name !== undefined && (i.locale ?? i.currency ?? i.timezone) !== undefined)
          throw new DomainError("INVALID_INPUT", { reason: "change the name in a separate call" });
        const lines: string[] = [];
        if (i.name !== undefined) lines.push(`${t("field.name")}: ${i.name}`);
        if (i.locale !== undefined)
          lines.push(`${t("field.language")}: ${i.locale === "en" ? "English" : "Bahasa Indonesia"}`);
        if (i.currency !== undefined) lines.push(`${t("field.currency")}: ${i.currency}`);
        if (i.timezone !== undefined) {
          if (!isValidTimezone(i.timezone)) throw new DomainError("INVALID_INPUT", { field: "timezone" });
          lines.push(`${t("field.timezone")}: ${i.timezone}`);
        }
        if (!lines.length) throw new DomainError("INVALID_INPUT", { reason: "nothing to change" });
        return { title: t("settings.profile"), lines, confirm: t("confirm.save") };
      }
      case "NOTIFICATION":
        return {
          title: t("settings.notification"),
          lines: [
            `${t(`topic.${need(i.topic, "topic")}`)} · ${need(i.channel, "channel") === "PUSH" ? "Push" : "Email"}: ${t(need(i.enabled, "enabled") ? "on" : "off")}`,
          ],
          confirm: t("confirm.save"),
        };
      case "DIGEST":
        return {
          title: t("settings.digest"),
          lines: [t(`digest.${need(i.digest, "digest")}`)],
          confirm: t("confirm.save"),
        };
      case "QUIET_HOURS":
        return {
          title: t("settings.quiet"),
          lines: [`${need(i.quietStart, "quietStart")}.00 – ${need(i.quietEnd, "quietEnd")}.00`],
          confirm: t("confirm.save"),
        };
      case "FEEDBACK":
        return { title: t("settings.feedback"), lines: [need(i.message, "message")], confirm: t("confirm.send") };
    }
  },

  async run(i, ctx, env) {
    const { t } = env;
    const actor = ctx.actor;
    const done = t("done.saved");
    const undo = (input: Record<string, unknown>) => ({ tool: "updateSettings", input });
    switch (i.action) {
      case "PROFILE": {
        await updateProfile(actor, { locale: i.locale, currency: i.currency, timezone: i.timezone });
        const before: Record<string, unknown> = { action: "PROFILE" };
        if (i.currency !== undefined) before.currency = actor.currency;
        if (i.timezone !== undefined) before.timezone = actor.timezone;
        const localeChanged = i.locale !== undefined && i.locale !== actor.locale;
        return {
          summary: done,

          ...(localeChanged ? { locale: i.locale } : Object.keys(before).length > 1 ? { undo: undo(before) } : {}),
        };
      }
      case "NOTIFICATION": {
        const topic = need(i.topic, "topic");
        const channel = need(i.channel, "channel");
        const prev = (await getSettings(actor)).prefs.find((p) => p.topic === topic)?.[channel];
        await setPref(actor, { topic, channel, enabled: need(i.enabled, "enabled") });
        return {
          summary: done,
          href: "/account/notifications",
          undo: undo({ action: "NOTIFICATION", topic, channel, enabled: prev ?? !i.enabled }),
        };
      }
      case "DIGEST": {
        const prev = (await getSettings(actor)).digest;
        await setDigestFrequency(actor, need(i.digest, "digest"));
        return { summary: done, href: "/account/notifications", undo: undo({ action: "DIGEST", digest: prev }) };
      }
    }
    return reviewOnly();
  },
};
