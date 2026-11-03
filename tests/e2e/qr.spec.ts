import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

import { expectText, newUser } from "../helpers/browser";

test("scan a friend's QR with the camera → connected", async ({ browser }) => {
  test.skip(!hasFfmpeg(), "ffmpeg not available");
  const cici = await newUser(browser, "cici.qr@e2e.test", "Cici");
  await cici.goto("/people/new");
  await cici.getByRole("button", { name: "Tampilkan QR-ku" }).click();
  const qr = cici.getByRole("img", { name: "QR" }).or(cici.locator('[aria-label="QR"]')).first();
  await expect(qr.locator("svg, path").first()).toBeVisible();

  const dir = mkdtempSync(path.join(tmpdir(), "catetin-qr-"));
  const png = path.join(dir, "qr.png");
  const video = path.join(dir, "qr.y4m");
  writeFileSync(png, await qr.screenshot());

  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-i",
    png,
    "-vf",
    "scale=360:360:flags=neighbor,pad=640:480:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p",
    "-t",
    "2",
    "-r",
    "10",
    video,
  ]);

  const camBrowser = await chromium.launch({
    channel: process.env.PW_CHANNEL ?? "chrome",
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${video}`,
    ],
  });
  try {
    const eko = await newUser(camBrowser, "eko.qr@e2e.test", "Eko");
    await eko.goto("/people/new");
    await eko.getByRole("button", { name: "Pindai QR teman" }).click();
    await eko.waitForURL(/\/invite\//, { timeout: 20_000 });
    await expectText(eko, "Terhubung dengan Cici?");
    await eko
      .getByRole("button", { name: /Terima|Hubungkan|Terhubung/ })
      .first()
      .click();
    await eko.waitForURL(/\/people\//);
    await expectText(eko, "Cici");
  } finally {
    await camBrowser.close();
  }
});

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
