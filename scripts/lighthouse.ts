import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import puppeteer, { type Browser } from "puppeteer-core";

type Mode = "mobile" | "desktop";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    mode: { type: "string", default: "both" },
    only: { type: "string" },
    runs: { type: "string", default: "1" },
    email: { type: "string", default: "andi@test.local" },
    mailpit: { type: "string", default: "http://localhost:8026" },
    list: { type: "boolean", default: false },
  },
});
const BASE = args.url.replace(/\/$/, "");
const MODES: Mode[] = args.mode === "both" ? ["mobile", "desktop"] : [args.mode as Mode];
const RUNS = Math.max(1, Number(args.runs) || 1);

const PUBLIC = ["/", "/login", "/privacy", "/terms"];
const APP = [
  "/home",
  "/people",
  "/people/archived",
  "/people/new",
  "/people/:partyId",
  "/people/:partyId/statement",
  "/people/:partyId/stats",
  "/groups",
  "/groups/new",
  "/groups/:groupId",
  "/debts/new",
  "/debts/:debtId",
  "/debts/:debtId/edit",
  "/payments/new",
  "/payments/:paymentId",
  "/bills/new",
  "/bills/:billId",
  "/inbox",
  "/search",
  "/debts",
  "/records",
  "/stats",
  "/account",
  "/account/notifications",
  "/account/sessions",
  "/account/blocked",
];

type Pair = { name: string; value: string };

async function login(): Promise<Pair[]> {
  const headers = { "content-type": "application/json", "origin": BASE };
  const since = Date.now();
  const sent = await fetch(`${BASE}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: args.email, type: "sign-in" }),
  });
  if (!sent.ok) throw new Error(`Sending OTP failed (${sent.status}): ${await sent.text()}`);

  let otp: string | undefined;
  for (let i = 0; i < 20 && !otp; i++) {
    await delay(500);
    const list = (await (await fetch(`${args.mailpit}/api/v1/search?query=to:${args.email}`)).json()) as {
      messages: { ID: string; Created: string }[];
    };
    const msg = list.messages.find((m) => new Date(m.Created).getTime() >= since - 2000);
    if (!msg) continue;
    const body = (await (await fetch(`${args.mailpit}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
    otp = body.Text.match(/\b(\d{6})\b/)?.[1];
  }
  if (!otp) throw new Error(`OTP code not found in Mailpit (${args.mailpit}). Did you run \`bun run services:up\`?`);

  const res = await fetch(`${BASE}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: args.email, otp }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${await res.text()}`);
  return res.headers.getSetCookie().map((c) => {
    const pair = c.split(";")[0]!;
    const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1) };
  });
}

const header = (pairs: Pair[]) => pairs.map((p) => `${p.name}=${p.value}`).join("; ");

async function logout(pairs: Pair[]) {
  await fetch(`${BASE}/api/auth/sign-out`, {
    method: "POST",
    headers: { "cookie": header(pairs), "origin": BASE, "content-type": "application/json" },
    body: "{}",
  }).catch(() => {});
}

async function setSession(browser: Browser, pairs: Pair[] | null) {
  const existing = await browser.cookies();
  if (existing.length) await browser.deleteCookie(...existing);
  if (!pairs) return;
  const domain = new URL(BASE).hostname;
  await browser.setCookie(
    ...pairs.map((p) => ({
      ...p,
      domain,
      path: "/",
      secure: p.name.startsWith("__Secure-"),
      httpOnly: p.name.includes("better-auth"),
    })),
  );
}

async function discoverIds(pairs: Pair[]): Promise<Record<string, string | undefined>> {
  const cookie = header(pairs);
  const html = async (p: string) => (await fetch(BASE + p, { headers: { cookie } })).text();
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const find = (text: string, seg: string) => text.match(new RegExp(`/${seg}/(${uuid})`))?.[1];

  const [home, people, groups] = await Promise.all([html("/home"), html("/people"), html("/groups")]);
  const partyId = find(people, "people");
  const groupId = find(groups, "groups");
  const more = [
    home,
    partyId ? await html(`/people/${partyId}`) : "",
    groupId ? await html(`/groups/${groupId}`) : "",
  ].join("\n");
  const debtIds = [...new Set([...more.matchAll(new RegExp(`/debts/(${uuid})`, "g"))].map((m) => m[1]!))];

  let paymentId = find(more, "payments");
  for (const id of debtIds.slice(0, 10)) {
    if (paymentId) break;
    paymentId = find(await html(`/debts/${id}`), "payments");
  }
  return { partyId, groupId, debtId: debtIds[0], paymentId, billId: find(more, "bills") };
}

type Result = {
  page: string;
  mode: Mode;
  scores: Record<string, number | null>;
  lcp: string;
  tbt: string;
  cls: string;
  file: string;
};

const CATS = [
  ["performance", "Perf"],
  ["accessibility", "A11y"],
  ["best-practices", "BP"],
  ["seo", "SEO"],
  ["agentic-browsing", "Agent"],
] as const;

async function main() {
  const home = await fetch(`${BASE}/login`).catch(() => null);
  if (!home?.ok) throw new Error(`Server ${BASE} can't be reached. Run \`bun run start\` first.`);
  if (/hmr-client|react-refresh/i.test(await home.text())) {
    console.warn(
      "Warning: This server is in dev mode - scores don't represent production. Use `bun run build && bun run start`.\n",
    );
  }

  const session = await login();
  const ids = await discoverIds(session);

  const wanted = args.only?.split(",").map((s) => s.trim());
  const pages: { route: string; path: string; authed: boolean }[] = [];
  for (const [list, authed] of [
    [PUBLIC, false],
    [APP, true],
  ] as const) {
    for (const route of list) {
      if (wanted && !wanted.some((w) => route === w || route.startsWith(`${w}/`))) continue;
      const missing = route.match(/:(\w+)/g)?.find((p) => !ids[p.slice(1)]);
      if (missing) {
        console.warn(`Skipping ${route}: no sample data for ${missing}`);
        continue;
      }
      const p = route.replace(/:(\w+)/g, (_, k: string) => ids[k]!);
      pages.push({ route, path: p, authed });
    }
  }

  if (args.list) {
    for (const pg of pages) console.log(`${pg.route.padEnd(28)} ${pg.path}`);
    await logout(session);
    return;
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outDir = path.join(".lighthouse", stamp);
  await fs.mkdir(outDir, { recursive: true });

  const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-first-run"] });
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null });
  const page = await browser.newPage();
  const results: Result[] = [];
  const total = pages.length * MODES.length;
  let n = 0;
  let failures = 0;
  try {
    for (const mode of MODES) {
      for (const pg of pages) {
        n++;
        process.stdout.write(`[${n}/${total}] ${mode.padEnd(7)} ${pg.route} ... `);
        const runs = [];
        for (let r = 0; r < RUNS; r++) {
          await setSession(browser, pg.authed ? session : null);
          const res = await lighthouse(
            BASE + pg.path,
            { output: "html", logLevel: "error" },
            mode === "desktop" ? desktopConfig : undefined,
            page,
          );
          if (res?.lhr.runtimeError) {
            console.log(`failed: ${res.lhr.runtimeError.code} - ${res.lhr.runtimeError.message}`);
            failures++;
          } else if (res) runs.push(res);
        }
        if (!runs.length) {
          if (failures >= 3 && !(await fetch(`${BASE}/login`).catch(() => null))?.ok) {
            throw new Error(`Server ${BASE} stopped responding mid-test.`);
          }
          continue;
        }
        failures = 0;

        runs.sort((a, b) => (a.lhr.categories.performance?.score ?? 0) - (b.lhr.categories.performance?.score ?? 0));
        const { lhr, report } = runs[Math.floor(runs.length / 2)]!;
        const file = `${mode}${pg.route.replace(/[/:]+/g, "_").replace(/_$/, "") || "_root"}.html`;
        await fs.writeFile(path.join(outDir, file), Array.isArray(report) ? report[0]! : report);
        const scores = Object.fromEntries(
          CATS.map(([id]) => [
            id,
            lhr.categories[id]?.score == null ? null : Math.round(lhr.categories[id].score * 100),
          ]),
        );
        const audit = (id: string) => lhr.audits[id]?.displayValue ?? "-";
        const row: Result = {
          page: pg.route,
          mode,
          scores,
          lcp: audit("largest-contentful-paint"),
          tbt: audit("total-blocking-time"),
          cls: audit("cumulative-layout-shift"),
          file,
        };
        results.push(row);
        console.log(CATS.map(([id, label]) => `${label} ${scores[id] ?? "-"}`).join("  "));
      }
    }
  } finally {
    await browser.disconnect();
    chrome.kill();
    await logout(session);
  }

  const table = summarize(results);
  await fs.writeFile(path.join(outDir, "summary.md"), table);
  await fs.writeFile(path.join(outDir, "summary.json"), JSON.stringify(results, null, 2));
  console.log(`\n${table}\nLaporan lengkap: ${outDir}/`);
}

function summarize(results: Result[]): string {
  const lines: string[] = [];
  for (const mode of MODES) {
    const rows = results.filter((r) => r.mode === mode);
    if (!rows.length) continue;
    lines.push(`## ${mode}`, "");
    lines.push(`| Page | ${CATS.map(([, l]) => l).join(" | ")} | LCP | TBT | CLS |`);
    lines.push(`|---|${CATS.map(() => "--:").join("|")}|--:|--:|--:|`);
    for (const r of rows) {
      const cells = CATS.map(([id]) => mark(r.scores[id] ?? null));
      lines.push(`| ${r.page} | ${cells.join(" | ")} | ${r.lcp} | ${r.tbt} | ${r.cls} |`);
    }
    const avg = (id: string) => {
      const v = rows.map((r) => r.scores[id]).filter((s): s is number => s != null);
      return v.length ? mark(Math.round(v.reduce((a, b) => a + b, 0) / v.length)) : "-";
    };
    lines.push(`| **rata-rata** | ${CATS.map(([id]) => avg(id)).join(" | ")} | | | |`, "");
  }
  return lines.join("\n");
}

function mark(score: number | null): string {
  if (score == null) return "-";
  return String(score);
}

main().catch((err) => {
  console.error(`\nError: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
