import { expect, test } from "@playwright/test";

import { expectText, newUser, recordDebt } from "../helpers/browser";

test("reports and both export URL generations show only the signed-in user's records", async ({ browser, request }) => {
  const page = await newUser(browser, "reports@e2e.test", "Reports");
  await page.goto("/people/new");
  await page.getByLabel("Nama", { exact: true }).fill("Rani");
  await page.getByRole("button", { name: "Tambah", exact: true }).click();
  await page.waitForURL(/\/people\/.+\?invite=1/);
  await page.keyboard.press("Escape");
  await recordDebt(page, "Rani", "25000", "Coffee report");
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "Statistik", exact: true })).toBeVisible();
  await expectText(page, /25\.000/);
  await page.goto(`/people/${id}/stats`);
  await expect(page.getByRole("heading", { name: "Rani", exact: true })).toBeVisible();
  await page.goto(`/people/${id}/statement`);
  await expectText(page, "Coffee report");
  await page.goto("/records");
  await expect(page).toHaveURL(/\/debts$/);
  await expectText(page, "Coffee report");
  const csv = await page.request.get(`/api/exports/people/${id}`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Coffee report");
  const pdf = await page.request.get(`/api/export/person/${id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  expect((await request.get(`/api/exports/people/${id}`)).status()).toBe(401);
  await page.context().close();
});
