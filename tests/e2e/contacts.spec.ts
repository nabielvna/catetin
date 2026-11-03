import { expect, test } from "@playwright/test";

import messages from "../../src/i18n/messages/id.json";
import { newUser } from "../helpers/browser";

test("create and rename a manual contact through the UI", async ({ browser }) => {
  const page = await newUser(browser, `contacts-${crypto.randomUUID()}@example.test`, "Ani Putri", "/people");
  await page.goto("/people/new");
  await page.getByLabel(messages.addPerson.name, { exact: true }).fill("Budi Santoso");
  await page.getByLabel(messages.addPerson.email, { exact: true }).fill("budi@example.test");
  await page.getByRole("button", { name: messages.addPerson.submit, exact: true }).click();
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]+\?invite=1$/);
  await expect(page.locator('[data-tour="invite.sheet"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-tour="invite.sheet"]')).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Budi Santoso", exact: true })).toBeVisible();
  await page.getByRole("button", { name: messages.common.more, exact: true }).click();
  await page.getByRole("menuitem", { name: messages.person.rename, exact: true }).click();
  await page.getByRole("textbox", { name: messages.person.rename, exact: true }).fill("Budi Kantor");
  await page.getByRole("button", { name: messages.common.save, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Budi Kantor", exact: true })).toBeVisible();
  await page.goto("/people");
  await expect(page.getByText("Budi Kantor", { exact: true })).toBeVisible();
  await expect(page.getByText("Budi Santoso", { exact: true })).toHaveCount(0);
});

test("a claimed contact connects both accounts", async ({ browser }) => {
  const ani = await newUser(browser, `invite-owner-${crypto.randomUUID()}@example.test`, "Ani Putri", "/people");
  await ani.goto("/people/new");
  await ani.getByLabel(messages.addPerson.name, { exact: true }).fill("Budi");
  await ani.getByRole("button", { name: messages.addPerson.submit, exact: true }).click();
  await expect(ani.locator('[data-tour="invite.sheet"]')).toBeVisible();
  await ani.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await ani.getByRole("button", { name: messages.invite.copyLink, exact: true }).click();
  const shared = await ani.evaluate(() => navigator.clipboard.readText());
  const link = new URL(shared.match(/https?:\/\/\S+/)![0]);
  const budi = await newUser(
    browser,
    `invite-claim-${crypto.randomUUID()}@example.test`,
    "Budi Santoso",
    link.pathname,
  );
  await budi.getByRole("button", { name: messages.invite.accept, exact: true }).click();
  await expect(budi).toHaveURL(/\/people\/[0-9a-f-]+$/);
  await expect(budi.getByRole("heading", { name: "Ani Putri", exact: true })).toBeVisible();
  await ani.goto("/people");
  await expect(ani.getByText("Budi", { exact: true })).toBeVisible();
  await ani.getByRole("link", { name: /^Budi / }).click();
  await expect(ani.getByText(messages.people.connected, { exact: true })).toBeVisible();
});
