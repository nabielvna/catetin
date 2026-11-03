import "server-only";

import { Button, Heading, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";

import { Layout } from "./layout";

export type DigestEmail = {
  subject: string;
  preview: string;
  heading: string;
  sections: Array<{ title: string; rows: Array<{ label: string; value: string; tone?: "pos" | "neg" }> }>;
  cta: string;
  url: string;
  footer: string;
};

export async function digestEmail(d: DigestEmail) {
  const color = (tone?: "pos" | "neg") => (tone === "pos" ? "#15803d" : tone === "neg" ? "#c62828" : "#0a0a0a");
  const el = (
    <Layout preview={d.preview} footer={d.footer}>
      <Heading style={{ fontSize: 20, margin: "20px 0 4px", color: "#0a0a0a" }}>{d.heading}</Heading>
      {d.sections.map((s) => (
        <Section key={s.title} style={{ marginTop: 18 }}>
          <Text
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "#6e6e6e",
              margin: "0 0 6px",
            }}
          >
            {s.title}
          </Text>
          {s.rows.map((r, i) => (
            <table
              key={i}
              width="100%"
              cellPadding={0}
              cellSpacing={0}
              style={{ borderBottom: "1px solid #ececec", padding: "8px 0" }}
            >
              <tbody>
                <tr>
                  <td style={{ fontSize: 14, color: "#3a3a3a" }}>{r.label}</td>
                  <td
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      textAlign: "right",
                      color: color(r.tone),
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.value}
                  </td>
                </tr>
              </tbody>
            </table>
          ))}
        </Section>
      ))}
      <Section style={{ marginTop: 22 }}>
        <Button
          href={d.url}
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
          {d.cta}
        </Button>
      </Section>
    </Layout>
  );
  const text = [
    d.heading,
    ...d.sections.flatMap((s) => ["", s.title, ...s.rows.map((r) => `- ${r.label}: ${r.value}`)]),
    "",
    d.url,
    "",
    d.footer,
  ].join("\n");
  return { subject: d.subject, html: await render(el), text };
}
