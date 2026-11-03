import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { digestEmail } from "@/integrations/email/templates/digest";
import { noticeEmail } from "@/integrations/email/templates/notification";
import { otpEmail } from "@/integrations/email/templates/otp";

describe("email rendering", () => {
  it.each(["id", "en"])("renders a sign-in code in %s", async (locale) => {
    const t = messagesFor(locale).email.otp;
    const mail = await otpEmail("123456", t);
    expect(mail.subject).toBe(t.subject);
    expect(mail.html).toContain("123456");
    expect(mail.text).toContain("123456");
  });
  it("escapes recipient content in HTML", async () => {
    const mail = await noticeEmail({
      subject: "Notice",
      preview: "Preview",
      heading: "<script>bad</script>",
      body: "<img src=x>",
      cta: "Open",
      url: "https://example.com",
      footer: "Footer",
    });
    expect(mail.html).not.toContain("<script>bad</script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("<script>bad</script>");
  });
  it("includes every digest section in plain text", async () => {
    const mail = await digestEmail({
      subject: "Digest",
      preview: "Preview",
      heading: "Summary",
      sections: [{ title: "Due", rows: [{ label: "Lunch", value: "Rp50.000", tone: "pos" }] }],
      cta: "Open",
      url: "https://example.com/home",
      footer: "Footer",
    });
    expect(mail.text).toContain("Due\n- Lunch: Rp50.000");
    expect(mail.html).toContain("Lunch");
  });
});
