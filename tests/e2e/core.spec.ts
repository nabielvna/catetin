import { expect, test } from "@playwright/test";

import { expectText, formReady, newUser, recordDebt } from "../helpers/browser";

test.describe.configure({ mode: "serial" });

test("invite & claim: records move, disputed ones are rejected, balances match on both sides", async ({ browser }) => {
  const andi = await newUser(browser, "andi@e2e.test", "Andi");
  await expectText(andi, "Belum ada catatan");

  await andi.goto("/people/new");
  await andi.getByLabel("Nama").fill("Budi");
  await andi.getByRole("button", { name: "Tambah" }).click();
  await andi.waitForURL(/\/people\/.+\?invite=1/);
  await andi.keyboard.press("Escape");
  await recordDebt(andi, "Budi", "50rb", "Bensin");
  await recordDebt(andi, "Budi", "30000", "Makan");
  await recordDebt(andi, "Budi", "99000", "Salah catat");
  await expectText(andi, /Rp\s?179\.000/);

  await andi.getByRole("button", { name: "Opsi lain" }).click();
  await andi.getByRole("menuitem", { name: "Undang Budi" }).click();
  await andi.getByRole("button", { name: "Salin link" }).waitFor();
  await andi.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await andi.getByRole("button", { name: "Salin link" }).click();
  const shared = await andi.evaluate(() => navigator.clipboard.readText());
  const url = new URL(shared.match(/https?:\/\/\S+/)![0]);

  const budi = await newUser(browser, "budi@e2e.test", "Budi Santoso", url.pathname);
  await budi.goto(url.pathname);
  await budi.getByRole("checkbox", { name: /Salah catat/ }).click();
  await budi.getByRole("button", { name: /Terima \(2 dicentang\)/ }).click();
  await budi.waitForURL(/\/people\//);
  await expectText(budi, "Kamu berutang ke Andi");
  await expectText(budi, /80\.000/);

  await andi.goto("/people");
  await expectText(andi, /\+Rp\s?80\.000/);
});

test("payment waits for confirmation, then approved from the inbox", async ({ browser }) => {
  const budi = await newUser(browser, "budi@e2e.test", "Budi Santoso");
  await budi.goto("/payments/new");
  await budi.getByRole("link", { name: /Andi/ }).click();
  await budi.getByLabel("Nominal").fill("70000");
  await budi.getByRole("button", { name: "Simpan" }).click();
  await budi.waitForURL(/\/people\//);

  const andi = await newUser(browser, "andi@e2e.test", "Andi");
  await andi.goto("/inbox?tab=action");
  await expectText(andi, /bilang sudah bayar Rp\s?70\.000/);
  await andi.getByRole("button", { name: "Konfirmasi" }).first().click();
  await expect(andi.getByText(/bilang sudah bayar/)).toHaveCount(0);
  await andi.goto("/people");
  await expectText(andi, /\+Rp\s?10\.000/);
});

test("split bill: I paid, tax & service, Budi's share waits for his confirmation", async ({ browser }) => {
  const andi = await newUser(browser, "andi@e2e.test", "Andi");
  await andi.goto("/bills/new");
  await formReady(andi);
  await andi.getByLabel("Nama tagihan").fill("Makan malam");
  await andi.getByLabel("Subtotal").fill("200rb");

  await andi.getByLabel("Service", { exact: true }).fill("5");
  await andi.getByLabel("Pajak", { exact: true }).fill("10");
  await andi.getByRole("button", { name: "Lanjut" }).click();
  await andi.getByRole("checkbox", { name: /Budi/ }).click();
  await andi.getByRole("button", { name: "Lanjut" }).click();
  await expectText(andi, /Rp\s?231\.000/);
  await andi.getByRole("button", { name: "Simpan tagihan" }).click();
  await andi.waitForURL(/\/bills\//);
  await expectText(andi, "menunggu");

  const budi = await newUser(browser, "budi@e2e.test", "Budi Santoso");
  await budi.goto("/inbox?tab=action");
  await expectText(budi, /mencatat kamu berutang Rp\s?115\.500/);
  await budi.getByRole("button", { name: "Konfirmasi" }).first().click();
  await expect(budi.getByText(/115\.500/)).toHaveCount(0);
});

test("debtor proposes a lower amount → creditor rejects with a reason", async ({ browser }) => {
  const budi = await newUser(browser, "budi@e2e.test", "Budi Santoso");
  await budi.goto("/people");
  await budi.getByRole("link", { name: /Andi/ }).click();
  await budi.getByRole("link", { name: /Makan malam/ }).click();
  await budi.waitForURL(/\/debts\//);
  await budi.getByRole("button", { name: "Opsi lain" }).filter({ visible: true }).click();
  await budi.getByRole("menuitem", { name: "Ubah" }).click();
  await budi.getByLabel("Nominal").fill("100000");
  await budi.getByRole("button", { name: "Simpan" }).click();
  await budi.waitForURL(/\/debts\/[^/]+$/);
  await expectText(budi, /menunggu persetujuan Andi/i);

  const andi = await newUser(browser, "andi@e2e.test", "Andi");
  await andi.goto("/inbox?tab=action");
  await expectText(andi, /mengajukan perubahan/);
  await andi.getByRole("button", { name: "Tolak" }).first().click();
  await andi.getByPlaceholder("Alasan (opsional)").fill("Sesuai struk");
  await andi.getByRole("button", { name: "Tolak" }).first().click();
  await expect(andi.getByText(/mengajukan perubahan/)).toHaveCount(0);

  await budi.goto("/inbox?tab=notifications");
  await expectText(budi, /Sesuai struk/);
});
