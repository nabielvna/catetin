import { expect, type Page, test } from "@playwright/test";

import { login, newUser } from "../helpers/browser";

const bottomNav = (p: Page) => p.getByRole("navigation").last();

test("language follows the account on every device & link", async ({ browser }) => {
  const hp = await newUser(browser, "citra@e2e.test", "Citra");

  await hp.goto("/account");
  await hp.getByRole("button", { name: /Bahasa/ }).click();
  await hp.getByRole("option", { name: "English" }).click();
  await expect(hp.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  expect(new URL(hp.url()).pathname).toBe("/account");
  await bottomNav(hp).getByRole("link", { name: "People" }).click();
  await hp.waitForURL((u) => u.pathname === "/people");
  await expect(bottomNav(hp).getByRole("link", { name: "People" })).toBeVisible();

  const state = await hp.context().storageState();
  const laptopCtx = await browser.newContext({
    storageState: {
      ...state,
      cookies: state.cookies.map((c) => (c.name === "NEXT_LOCALE" ? { ...c, value: "id" } : c)),
    },
  });
  const laptop = await laptopCtx.newPage();
  await laptop.goto("/home");
  await expect(bottomNav(laptop).getByRole("link", { name: "Home" })).toBeVisible();
  expect(new URL(laptop.url()).pathname).toBe("/home");

  await laptop.goto("/account");
  await laptop.getByRole("button", { name: /Language/ }).click();
  await laptop.getByRole("option", { name: "Indonesia" }).click();
  await expect(laptop.getByRole("heading", { name: "Akun", exact: true })).toBeVisible();
  expect(new URL(laptop.url()).pathname).toBe("/account");

  await bottomNav(hp).getByRole("link", { name: "Home" }).click();
  await hp.waitForURL((u) => u.pathname === "/home");
  await expect(bottomNav(hp).getByRole("link", { name: "Beranda" })).toBeVisible();

  await hp.goto("/en/people");
  await hp.waitForURL((u) => u.pathname === "/people");
  await expect(bottomNav(hp).getByRole("link", { name: "Orang" })).toBeVisible();

  await laptopCtx.close();
});

test("public pages without a language prefix", async ({ browser }) => {
  const en = await browser.newContext({ locale: "en-US" });
  const page = await en.newPage();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to Catetin" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
  await en.close();

  const id = await browser.newContext({ locale: "id-ID" });
  const old = await id.newPage();
  await old.goto("/en/privacy");
  await old.waitForURL((u) => u.pathname === "/privacy");
  await expect(old.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await id.close();
});

test("sign out another device from the Devices page", async ({ browser }) => {
  const hp = await newUser(browser, "dewi@e2e.test", "Dewi");

  const laptopCtx = await browser.newContext();
  const laptop = await laptopCtx.newPage();
  await login(laptop, "dewi@e2e.test", "Dewi");

  await hp.goto("/account/devices");
  const others = hp.locator("section", { hasText: "Perangkat lain" }).getByRole("button");
  await expect(others).toHaveCount(1);
  await others.click();
  const detail = hp.getByRole("dialog");
  await expect(detail.getByText("Alamat IP")).toBeVisible();
  await detail.getByRole("button", { name: "Keluarkan perangkat ini" }).click();
  await expect(hp.getByText("Tidak ada perangkat lain yang sedang masuk.")).toBeVisible();

  await hp.goto("/home");
  expect(new URL(hp.url()).pathname).toBe("/home");
  await laptopCtx.close();
});
