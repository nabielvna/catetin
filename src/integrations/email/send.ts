import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

import { env } from "@/lib/server/env";
import { log } from "@/lib/server/logger";

let transporter: Transporter | undefined;

function transport(): Transporter {
  if (!transporter) {
    const e = env();
    transporter = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export type Mail = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> };

export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  await transport().sendMail({
    from: { name: e.SMTP_FROM_NAME, address: e.SMTP_FROM_EMAIL },
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: mail.headers,
  });
  log.info({ kind: "email_sent" }, "email sent");
}
