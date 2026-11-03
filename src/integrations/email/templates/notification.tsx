import "server-only";

import { Button, Heading, Link, Text } from "@react-email/components";
import { render } from "@react-email/render";

import { Layout } from "./layout";

export type NoticeEmail = {
  subject: string;
  preview: string;
  heading: string;
  body: string;
  cta: string;
  url: string;
  footer: string;
  unsubscribeUrl?: string;
  unsubscribeLabel?: string;
};

export async function noticeEmail(n: NoticeEmail) {
  const el = (
    <Layout
      preview={n.preview}
      footer={
        <>
          {n.footer}
          {n.unsubscribeUrl ? (
            <>
              {" · "}
              <Link href={n.unsubscribeUrl} style={{ color: "#6e6e6e" }}>
                {n.unsubscribeLabel}
              </Link>
            </>
          ) : null}
        </>
      }
    >
      <Heading style={{ fontSize: 20, margin: "20px 0 8px", color: "#0a0a0a" }}>{n.heading}</Heading>
      <Text style={{ fontSize: 15, color: "#3a3a3a", margin: "0 0 20px", lineHeight: 1.5 }}>{n.body}</Text>
      <Button
        href={n.url}
        style={{
          background: "#0a0a0a",
          color: "#ffffff",
          padding: "12px 20px",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        {n.cta}
      </Button>
    </Layout>
  );
  return {
    subject: n.subject,
    html: await render(el),
    text: `${n.heading}\n\n${n.body}\n\n${n.url}\n\n${n.footer}${n.unsubscribeUrl ? `\n${n.unsubscribeUrl}` : ""}`,
  };
}
