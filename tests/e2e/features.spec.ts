import { expect, type Page, test } from "@playwright/test";

import { expectText, formReady, newUser, recordDebt } from "../helpers/browser";

test.describe.configure({ mode: "serial" });

async function connect(cici: Page, browser: Parameters<typeof newUser>[0]) {
  await cici.goto("/people/new");
  await cici.getByLabel("Nama").fill("Dedi");
  await cici.getByRole("button", { name: "Tambah" }).click();
  await cici.waitForURL(/\/people\/.+\?invite=1/);
  await cici.getByRole("button", { name: "Salin link" }).waitFor();
  await cici.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await cici.getByRole("button", { name: "Salin link" }).click();
  const shared = await cici.evaluate(() => navigator.clipboard.readText());
  const url = new URL(shared.match(/https?:\/\/\S+/)![0]);
  const dedi = await newUser(browser, "dedi@e2e.test", "Dedi", url.pathname);
  await dedi.goto(url.pathname);
  await dedi.getByRole("button", { name: /Terima/ }).click();
  await dedi.waitForURL(/\/people\//);
  return dedi;
}

async function openPerson(page: Page, name: string) {
  await page.goto("/people");
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  await page.waitForURL(/\/people\/[0-9a-f-]{36}/);
}

test("mutual trust: both ways, records take effect immediately, can be disputed", async ({ browser }) => {
  const cici = await newUser(browser, "cici@e2e.test", "Cici");
  const dedi = await connect(cici, browser);

  await openPerson(cici, "Dedi");
  await cici.getByRole("switch", { name: "Saling percaya" }).click();
  await cici.getByRole("button", { name: "Nyalakan saling percaya" }).click();
  await expectText(cici, "Menunggu Dedi ikut menyalakan");

  await openPerson(dedi, "Cici");
  await expectText(dedi, "Cici mengajak saling percaya");
  await dedi.getByRole("button", { name: "Nyalakan" }).first().click();
  await dedi.getByRole("button", { name: "Nyalakan" }).last().click();
  await expectText(dedi, "Kamu & Cici saling percaya");

  await recordDebt(cici, "Dedi", "45rb", "Tiket konser");
  await expect(cici.getByText("menunggu Dedi")).toHaveCount(0);

  await dedi.goto("/inbox?tab=action");
  await expectText(dedi, "Berlaku otomatis (saling percaya)");
  await expectText(dedi, /Tiket konser/);
  await dedi.getByRole("button", { name: "Bantah" }).first().click();
  await dedi.getByPlaceholder("Alasan (opsional)").fill("bukan aku");
  await dedi.getByRole("button", { name: "Bantah" }).last().click();
  await expectText(dedi, "Dibantah dan dikembalikan");

  await openPerson(cici, "Dedi");
  await cici.getByRole("tab", { name: /Semua riwayat/ }).click();
  await expectText(cici, "Ditolak");
});

test("installments: schedule shows on the debt detail", async ({ browser }) => {
  const cici = await newUser(browser, "cici@e2e.test", "Cici");
  await cici.goto("/debts/new");
  await cici.getByRole("textbox", { name: "Dengan siapa" }).fill("Dedi");
  await cici.getByRole("button", { name: /Dedi/ }).first().click();
  await cici.getByLabel("Nominal").fill("300rb");
  await cici.getByLabel("Untuk apa").fill("HP bekas");
  await cici.getByRole("radio", { name: "Cicil" }).click();
  await expectText(cici, /3× ± Rp\s?100\.000/);
  await cici.getByRole("button", { name: "Simpan" }).click();
  await cici.waitForURL(/\/people\//);
  await cici.getByRole("link", { name: /HP bekas/ }).click();
  await expectText(cici, "Cicilan");
  await expect(cici.getByText("Cicilan berikutnya")).toBeVisible();
  const schedule = cici.locator("section", { has: cici.getByRole("heading", { name: /^Cicilan/ }) });
  await expect(schedule.locator("li")).toHaveCount(3);
});

test("recurring: debtor starts it → active immediately, then stopped", async ({ browser }) => {
  const dedi = await newUser(browser, "dedi@e2e.test", "Dedi");
  await dedi.goto("/debts/new");
  await dedi.getByRole("textbox", { name: "Dengan siapa" }).fill("Cici");
  await dedi.getByRole("button", { name: /Cici/ }).first().click();
  await dedi.getByRole("radio", { name: "Aku pinjam" }).click();
  await dedi.getByLabel("Nominal").fill("50rb");
  await dedi.getByLabel("Untuk apa").fill("Netflix");
  await dedi.getByRole("radio", { name: "Berulang" }).click();
  await dedi.getByRole("button", { name: "Simpan" }).click();
  await dedi.waitForURL(/\/people\//);
  await expectText(dedi, "Catatan berulang dimulai");
  await expectText(dedi, "Berulang");
  await dedi.getByRole("button", { name: /Netflix/ }).click();
  await dedi.getByRole("button", { name: "Hentikan" }).click();
  await expectText(dedi, "Catatan berulang dihentikan");
});

test("overpayment becomes a reverse debt; label & PDF", async ({ browser }) => {
  const dedi = await newUser(browser, "dedi@e2e.test", "Dedi");
  await openPerson(dedi, "Cici");
  await dedi.getByRole("link", { name: "Bayar" }).click();
  await dedi.waitForURL(/\/payments\/new/);
  await formReady(dedi);
  await dedi.getByLabel("Nominal").fill("400rb");
  await expectText(dedi, /jadi kamu berutang|jadi Cici berutang/);
  await dedi.getByRole("button", { name: "Simpan" }).click();
  await dedi.waitForURL(/\/people\//);

  const cici = await newUser(browser, "cici@e2e.test", "Cici");
  await openPerson(cici, "Dedi");

  await expectText(cici, "Kamu berutang ke Dedi");
  await cici.getByRole("tab", { name: /Lunas/ }).click();
  await cici.getByRole("link", { name: /HP bekas/ }).click();
  await cici.getByRole("button", { name: /Label/ }).click();
  await cici.getByPlaceholder("mis. kantor, arisan").fill("gadget");
  await cici.keyboard.press("Enter");
  await cici.getByRole("button", { name: "Simpan" }).click();
  await expect(cici.getByRole("dialog")).toBeHidden();
  await expectText(cici, "#gadget");
  await cici.goto("/search?label=gadget");
  await expectText(cici, "HP bekas");

  const personUrl = await (async () => {
    await openPerson(cici, "Dedi");
    return new URL(cici.url()).pathname;
  })();
  const res = await cici.request.get(`/api/export${personUrl.replace("/people", "/person")}/pdf`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/pdf");
  expect((await res.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("PWA: passes Chrome install criteria (manifest, icons, service worker)", async ({ browser }) => {
  const cici = await newUser(browser, "cici@e2e.test", "Cici");
  await cici.goto("/home");
  await cici.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await cici.context().newCDPSession(cici);
  const { installabilityErrors } = (await cdp.send("Page.getInstallabilityErrors")) as {
    installabilityErrors: Array<{ errorId: string }>;
  };

  expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== "in-incognito")).toEqual([]);
  const manifest = (await cdp.send("Page.getAppManifest")) as { errors: unknown[] };
  expect(manifest.errors).toEqual([]);
});

test("rename: the screen updates right away without changing page (D-105)", async ({ browser }) => {
  const eka = await newUser(browser, "eka@e2e.test", "Eka");
  await eka.goto("/people/new");
  await eka.getByLabel("Nama").fill("Gita");
  await eka.getByRole("button", { name: "Tambah" }).click();
  await eka.waitForURL(/\/people\/.+\?invite=1/);
  await eka.keyboard.press("Escape");

  await eka.getByRole("link", { name: "Orang" }).click();
  await eka.getByRole("link", { name: /Gita/ }).click();
  const name = eka.getByRole("heading", { level: 1 });
  await expect(name).toHaveText("Gita");

  for (const next of ["Gita Baru", "Hana", "Hana Putri"]) {
    await eka.getByRole("button", { name: "Opsi lain" }).click();
    await eka.getByRole("menuitem", { name: "Ganti nama" }).click();
    await eka.getByRole("dialog").getByRole("textbox").fill(next);
    await eka.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
    await expect(name).toHaveText(next);
    await expect(eka.getByRole("dialog")).toHaveCount(0);
  }

  await eka.getByRole("link", { name: "Orang" }).click();
  await expect(eka.getByRole("link", { name: /Hana Putri/ })).toBeVisible();
  await expect(eka.getByText("Gita")).toHaveCount(0);
});
