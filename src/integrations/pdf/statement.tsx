import "server-only";

import path from "node:path";

import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { createTranslator } from "next-intl";

import type { Currency } from "@/domain/money";
import { type StatementEntry, statementRows } from "@/domain/statement";
import { messagesFor } from "@/i18n/messages";
import { formatDate, money } from "@/lib/format";

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "src/integrations/pdf/fonts");
  Font.register({
    family: "Geist",
    fonts: [
      { src: path.join(dir, "Geist-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Geist-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
  fontsReady = true;
}

const s = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 9.5, color: "#0a0a0a", padding: 36, paddingBottom: 54 },
  brand: { fontSize: 14, fontWeight: 700, letterSpacing: -0.4 },
  title: { fontSize: 18, fontWeight: 700, marginTop: 10 },
  sub: { fontSize: 9, color: "#6e6e6e", marginTop: 3 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0a0a0a", paddingVertical: 5, marginTop: 16 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#dcdcdc", paddingVertical: 5 },
  th: { fontWeight: 700 },
  cDate: { width: 62 },
  cItem: { flex: 1, paddingRight: 6 },
  cAmt: { width: 88, textAlign: "right" },
  cBal: { width: 92, textAlign: "right", fontWeight: 700 },
  muted: { color: "#6e6e6e" },
  pos: { color: "#15803d" },
  neg: { color: "#c62828" },
  total: { marginTop: 12, fontSize: 10.5, fontWeight: 700 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    fontSize: 8,
    color: "#6e6e6e",
  },
});

export async function statementPdf(input: {
  locale: "id" | "en";
  me: string;
  name: string;
  today: string;
  entries: Array<StatementEntry & { title: string }>;
  net: Partial<Record<Currency, number>>;
}): Promise<Buffer> {
  registerFonts();
  const { locale } = input;
  const t = createTranslator({ locale, messages: messagesFor(locale), namespace: "pdf" });
  const tp = createTranslator({ locale, messages: messagesFor(locale), namespace: "payment" });
  const tm = createTranslator({ locale, messages: messagesFor(locale), namespace: "money" });
  const rows = statementRows(input.entries);
  const net = Object.entries(input.net).filter(([, v]) => v);

  const doc = (
    <Document title={t("title", { name: input.name })} author="Catetin" creator="Catetin" language={locale}>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>catetin</Text>
        <Text style={s.title}>{t("title", { name: input.name })}</Text>
        <Text style={s.sub}>{t("generated", { me: input.me, date: formatDate(input.today, locale) })}</Text>

        <View style={s.head} fixed>
          <Text style={[s.th, s.cDate]}>{t("date")}</Text>
          <Text style={[s.th, s.cItem]}>{t("item")}</Text>
          <Text style={[s.th, s.cAmt]}>{t("amount")}</Text>
          <Text style={[s.th, s.cBal]}>{t("balance")}</Text>
        </View>
        {rows.length === 0 ? <Text style={[s.muted, { marginTop: 8 }]}>{t("empty")}</Text> : null}
        {rows.map((e) => (
          <View key={`${e.kind}:${e.id}`} style={s.row} wrap={false}>
            <Text style={s.cDate}>
              {formatDate(e.date, locale, { day: "numeric", month: "short", year: "2-digit" })}
            </Text>
            <Text style={s.cItem}>
              {e.kind === "OBLIGATION"
                ? e.title
                : `${tp(`kind.${e.settlementKind ?? "PAYMENT"}` as never)}${e.title ? ` — ${e.title}` : ""}`}
              {e.groupName ? <Text style={s.muted}> · {e.groupName}</Text> : null}
            </Text>
            <Text style={[s.cAmt, e.delta > 0 ? s.pos : e.delta < 0 ? s.neg : s.muted]}>
              {e.delta === 0 ? "—" : money(e.delta, e.currency, locale, "always")}
            </Text>
            <Text style={s.cBal}>{money(e.balance, e.currency, locale, "always")}</Text>
          </View>
        ))}
        <Text style={s.total}>
          {net.length === 0
            ? tm("allSettled")
            : net
                .map(
                  ([c, v]) =>
                    `${v! > 0 ? tm("theyOweYou", { name: input.name }) : tm("youOweThem", { name: input.name })} ${money(Math.abs(v!), c, locale)}`,
                )
                .join(" · ")}
        </Text>

        <View style={s.footer} fixed>
          <Text style={{ flex: 1 }}>{t("footer")}</Text>
          <Text render={({ pageNumber, totalPages }) => t("page", { page: pageNumber, total: totalPages })} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
