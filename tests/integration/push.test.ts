import { execFileSync } from "node:child_process";
import { createECDH, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { IncomingHttpHeaders } from "node:http";
import { Agent, createServer, get } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
// @ts-expect-error http_ece has no types (web-push dependency)
import ece from "http_ece";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import webpush from "web-push";

import { db } from "@/database/client";
import { notification, pushSubscription } from "@/database/schema/notifications";
import { savePushSubscription } from "@/services/account/settings";
import { dispatchPending } from "@/services/notifications/dispatch";

import { connected, debt, makeUser, record } from "../helpers/factories";

vi.hoisted(async () => {
  const { default: wp } = await import("web-push");
  const v = wp.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = v.publicKey;
  process.env.VAPID_PRIVATE_KEY = v.privateKey;
  process.env.VAPID_SUBJECT = "mailto:test@catetin.local";
});

type Received = { path: string; headers: IncomingHttpHeaders; body: Buffer };
const received: Received[] = [];
let base = "";

const certDir = mkdtempSync(path.join(tmpdir(), "catetin-push-"));
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
    "-keyout",
    path.join(certDir, "key.pem"),
    "-out",
    path.join(certDir, "cert.pem"),
  ],
  { stdio: "ignore" },
);
const tls = { key: readFileSync(path.join(certDir, "key.pem")), cert: readFileSync(path.join(certDir, "cert.pem")) };
const server = createServer(tls, (req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    received.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
    res.statusCode = req.url?.startsWith("/gone") ? 410 : 201;
    res.end();
  });
});

const agent = new Agent({ ca: tls.cert, rejectUnauthorized: true });
const sendNotification = webpush.sendNotification.bind(webpush);
const transport = vi.spyOn(webpush, "sendNotification").mockImplementation((subscription, payload, options) => {
  const local = new URL(subscription.endpoint).origin === base;
  return sendNotification(subscription, payload, { ...options, ...(local ? { agent } : {}) });
});

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  transport.mockRestore();
  agent.destroy();
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(certDir, { recursive: true, force: true });
});

function device() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, p256dh: ecdh.getPublicKey().toString("base64url"), authB64: auth.toString("base64url") };
}

const ALL = 100_000;
const today = new Date();
const MORNING = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1, 3));

describe("push notifications (server → push service)", () => {
  it("rejects untrusted HTTPS certificates outside the test transport", async () => {
    await expect(
      new Promise<number | undefined>((resolve, reject) => {
        const request = get(`${base}/untrusted`, (response) => {
          response.resume();
          resolve(response.statusCode);
        });
        request.on("error", reject);
      }),
    ).rejects.toMatchObject({ code: "DEPTH_ZERO_SELF_SIGNED_CERT" });
  });

  it("sent encrypted with VAPID & openable by the device; content is text in the recipient's language", async () => {
    const andi = await makeUser("Andi");
    const budi = await makeUser("Budi");
    await connected(andi, budi);
    const d = device();
    await savePushSubscription(
      budi.actor,
      { endpoint: `${base}/ok/${budi.actor.userId}`, p256dh: d.p256dh, auth: d.authB64 },
      null,
    );

    await record(andi, debt(andi, budi, 25_000, { title: "Es kopi" }));
    await dispatchPending({ now: MORNING, limit: ALL });

    const hit = received.find((r) => r.path === `/ok/${budi.actor.userId}`);
    expect(hit).toBeDefined();
    expect(hit!.headers["content-encoding"]).toBe("aes128gcm");
    expect(hit!.headers.urgency).toBe("high");
    expect(String(hit!.headers.authorization)).toMatch(/^vapid t=.+, k=/);
    const plain = ece.decrypt(hit!.body, { version: "aes128gcm", privateKey: d.ecdh, authSecret: d.authB64 });
    const msg = JSON.parse(plain.toString("utf8"));
    expect(msg).toMatchObject({ title: "Andi mencatat utang", url: expect.stringMatching(/^\/debts\//) });
    expect(msg.body).toMatch(/Rp\s?25\.000/);
    expect(msg.body).toContain("Es kopi");

    const [row] = await db.select().from(notification).where(eq(notification.recipientUserId, budi.actor.userId));
    expect(row).toBeDefined();
  });

  it("quiet hours delay it; a 410 endpoint deletes the subscription", async () => {
    const andi = await makeUser("Andi");
    const cici = await makeUser("Cici");
    await connected(andi, cici);
    const d = device();
    const endpoint = `${base}/gone/${cici.actor.userId}`;
    await savePushSubscription(cici.actor, { endpoint, p256dh: d.p256dh, auth: d.authB64 }, null);
    await record(andi, debt(andi, cici, 5_000));

    await dispatchPending({
      now: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 16)),
      limit: ALL,
    });
    expect(received.some((r) => r.path === `/gone/${cici.actor.userId}`)).toBe(false);

    await dispatchPending({ now: MORNING, limit: ALL });
    expect(received.some((r) => r.path === `/gone/${cici.actor.userId}`)).toBe(true);
    expect(await db.select().from(pushSubscription).where(eq(pushSubscription.endpoint, endpoint))).toHaveLength(0);
  });
});
