import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";

import { type TourId, type TourParams, TOURS } from "@/lib/tours";

import { formReady, newUser, recordDebt } from "../helpers/browser";

test.describe.configure({ mode: "serial" });

const DB = process.env.TEST_DATABASE_URL;
if (!DB) throw new Error("Set TEST_DATABASE_URL to the prepared browser-test database.");

const bubble = (page: Page) => page.locator('[data-slot="tour-bubble"] [role="status"]');

async function startTour(page: Page, id: TourId, params: TourParams = {}, vars: Record<string, string> = {}) {
  for (let i = 0; i < 20; i++) {
    await page.evaluate((detail) => window.dispatchEvent(new CustomEvent("catetin:tour", { detail })), {
      id,
      params,
      vars,
    });
    if (
      await bubble(page)
        .waitFor({ timeout: 500 })
        .then(() => true)
        .catch(() => false)
    )
      return true;
  }
  return false;
}

let page: Page;
let partyId: string;
const ids: TourParams = {};

test.beforeAll(async ({ browser }) => {
  page = await newUser(browser, "eka@e2e.test", "Eka");
  await page.goto("/people/new");
  await page.getByLabel("Nama").fill("Rina");
  await page.getByRole("button", { name: "Tambah" }).click();
  await page.waitForURL(/\/people\/.+\?invite=1/);
  partyId = new URL(page.url()).pathname.split("/").pop()!;
  await page.keyboard.press("Escape");
});

test("rename: starts from another page, advances when its button is tapped, ends when saved", async () => {
  await page.goto("/home");
  await startTour(page, "person.rename", { partyId }, { name: "Rina" });

  await page.waitForURL(new RegExp(`/people/${partyId}`));
  await expect(bubble(page)).toHaveText("Ketuk ⋯ di kanan atas");
  await expect(page.getByText("Ganti nama Rina · 1 dari 3")).toBeVisible();

  await page.getByRole("button", { name: "Opsi lain" }).click();
  await expect(bubble(page)).toHaveText("Pilih Ganti nama");
  await page.getByRole("menuitem", { name: "Ganti nama" }).click();
  await expect(bubble(page)).toHaveText("Ketik nama baru, lalu ketuk Simpan");

  await page.getByRole("dialog").getByRole("textbox").fill("Rina Ayu");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Beres!")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rina Ayu");
  await page.getByRole("button", { name: "Oke" }).click();
  await expect(page.getByText("Beres!")).toHaveCount(0);
});

test("tapping the dimmed area ends the guide without pressing the button underneath", async () => {
  await page.goto(`/people/${partyId}`);
  await startTour(page, "person.rename", { partyId });
  await expect(bubble(page)).toHaveText("Ketuk ⋯ di kanan atas");

  const record = await page.getByRole("link", { name: "Catat utang" }).boundingBox();
  await page.mouse.click(record!.x + record!.width / 2, record!.y + record!.height / 2);
  await expect(bubble(page)).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe(`/people/${partyId}`);
});

test("installments: the Installments option must be tapped before the Save button is highlighted", async () => {
  await page.goto("/home");
  await startTour(page, "debt.installments");
  await expect(bubble(page)).toHaveText("Ketuk tombol + di tengah bawah");
  await page.getByRole("button", { name: "Catat baru" }).click();
  await expect(bubble(page)).toHaveText("Pilih Utang (atau Catat utang di halaman orangnya)");
  await page.getByRole("button", { name: /^Utang/ }).click();
  await page.waitForURL(/\/debts\/new/);
  await formReady(page);
  await expect(bubble(page)).toHaveText("Di bagian Rencana, pilih Cicil");
  await page.getByRole("radio", { name: "Cicil" }).click();
  await expect(bubble(page)).toHaveText("Isi jumlah cicilan & jatuh tempo pertama, lalu ketuk Simpan");
  await page.getByRole("button", { name: "Berhenti panduan" }).click();
  await expect(bubble(page)).toHaveCount(0);
});

const NEEDS_DATA: TourId[] = [
  "person.remind",
  "person.trust",
  "debt.stopRepeat",
  "payment.offset",
  "group.acceptInvite",
];

test("every guide finds its first step", async () => {
  test.setTimeout(300_000);
  await recordDebt(page, "Rina", "50000", "Bensin");
  await page.goto(`/payments/new?with=${partyId}&dir=in`);
  await formReady(page);
  await page.getByLabel("Nominal").first().fill("10000");
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.waitForURL(/\/people\//);
  await page.goto("/groups/new");
  await formReady(page);
  await page.getByLabel("Nama grup").fill("Kos Tour");
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}/);

  const sql = postgres(DB, { max: 1, onnotice: () => {} });
  const [debt] = await sql<{ id: string }[]>`select id from obligation order by created_at desc limit 1`;
  const [pay] = await sql<{ id: string }[]>`select id from settlement order by created_at desc limit 1`;
  const [group] = await sql<{ id: string }[]>`select id from groups order by created_at desc limit 1`;
  await sql.end();
  Object.assign(ids, { partyId, debtId: debt!.id, paymentId: pay!.id, groupId: group!.id });

  const missing: string[] = [];
  for (const id of Object.keys(TOURS) as TourId[]) {
    if (NEEDS_DATA.includes(id)) continue;
    await page.goto("/home");
    const found = await startTour(page, id, ids);
    if (!found) missing.push(id);
    else await page.getByRole("button", { name: "Berhenti panduan" }).click();
  }
  expect(missing).toEqual([]);
});
