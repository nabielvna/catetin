import "server-only";

import { Heading, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";

import { Layout } from "./layout";

export type OtpEmailText = { subject: string; preview: string; heading: string; body: string; ignore: string };

export async function otpEmail(code: string, t: OtpEmailText) {
  const el = (
    <Layout preview={t.preview} footer={t.ignore}>
      <Heading style={{ fontSize: 20, margin: "20px 0 8px", color: "#0a0a0a" }}>{t.heading}</Heading>
      <Text style={{ fontSize: 15, color: "#3a3a3a", margin: "0 0 16px" }}>{t.body}</Text>
      <Section style={{ background: "#0a0a0a", borderRadius: 10, padding: "18px 0", textAlign: "center" }}>
        <Text
          style={{
            margin: 0,
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "0.3em",
            color: "#ffffff",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {code}
        </Text>
      </Section>
    </Layout>
  );
  return { subject: t.subject, html: await render(el), text: `${t.heading}\n\n${code}\n\n${t.ignore}` };
}
