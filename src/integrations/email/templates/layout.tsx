import "server-only";

import { Body, Container, Head, Hr, Html, Preview, Text } from "@react-email/components";

const font = "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export function Layout(props: { preview: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={{ margin: 0, padding: "24px 12px", background: "#f4f4f4", fontFamily: font }}>
        <Container style={{ maxWidth: 480, background: "#ffffff", borderRadius: 10, padding: 28 }}>
          <Text style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: "-0.04em", color: "#0a0a0a" }}>
            catetin
          </Text>
          {props.children}
          {props.footer ? (
            <>
              <Hr style={{ borderColor: "#ececec", margin: "24px 0 12px" }} />
              <Text style={{ fontSize: 12, color: "#6e6e6e", margin: 0 }}>{props.footer}</Text>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
