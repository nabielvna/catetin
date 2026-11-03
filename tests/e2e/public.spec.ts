import { expect, test } from "@playwright/test";

import en from "../../src/i18n/messages/en.json";
import id from "../../src/i18n/messages/id.json";

test("public entry and legal documents render in both languages", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: id.landing.headline, exact: true })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: id.legal.privacy.title, exact: true })).toBeVisible();
  await page.goto("/en/privacy");
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: en.legal.privacy.title, exact: true })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: en.legal.terms.title, exact: true })).toBeVisible();
});
