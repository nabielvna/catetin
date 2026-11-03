import "server-only";

import { createTranslator } from "next-intl";

import { formatMoney } from "@/domain/money";
import { messagesFor } from "@/i18n/messages";
import type { DigestEmail } from "@/integrations/email/templates/digest";
import type { DigestData, DigestLine } from "@/services/notifications/types";

export function renderDigest(d: DigestData, locale: "id" | "en", url: string): DigestEmail {
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "email.digest" });
  const intl = locale === "en" ? "en-US" : "id-ID";
  const money = (n: number, c: string) => formatMoney(Math.abs(n), c as never, intl);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso));
  const line = (l: DigestLine, overdue: boolean) => ({
    label: t(l.direction === "THEY_OWE" ? "theyOwe" : "iOwe", {
      name: l.name,
      title: l.title,
      when: overdue ? t("daysLate", { days: l.days }) : date(l.dueOn),
      seq: l.seq ?? 0,
      hasSeq: l.seq ? "yes" : "no",
    }),
    value: money(l.amount, l.currency),
    tone: (l.direction === "THEY_OWE" ? "pos" : "neg") as "pos" | "neg",
  });

  const sections: DigestEmail["sections"] = [];
  if (d.awaiting || d.disputable) {
    const rows = [];
    if (d.awaiting) rows.push({ label: t("awaiting"), value: String(d.awaiting) });
    if (d.disputable) rows.push({ label: t("disputable"), value: String(d.disputable) });
    sections.push({ title: t("actionTitle"), rows });
  }
  if (d.overdue.length) {
    const rows = d.overdue.map((l) => line(l, true));
    if (d.overdueMore) rows.push({ label: t("more", { count: d.overdueMore }), value: "", tone: "neg" });
    sections.push({ title: t("overdueTitle"), rows });
  }
  if (d.due.length) {
    sections.push({
      title: t(d.frequency === "DAILY" ? "dueTodayTitle" : "dueTitle"),
      rows: d.due.map((l) => line(l, false)),
    });
  }
  if (d.net.length) {
    sections.push({
      title: t("balanceTitle"),
      rows: d.net.map((n) => ({
        label: t(n.amount > 0 ? "netOwedToYou" : "netYouOwe"),
        value: money(n.amount, n.currency),
        tone: n.amount > 0 ? ("pos" as const) : ("neg" as const),
      })),
    });
  }
  const subject = t(d.frequency === "DAILY" ? "subjectDaily" : "subjectWeekly");
  return {
    subject,
    preview: sections.map((s) => s.title).join(" · "),
    heading: subject,
    sections,
    cta: t("cta"),
    url,
    footer: t("footer"),
  };
}
