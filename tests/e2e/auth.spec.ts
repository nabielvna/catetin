import { expect, test } from "@playwright/test";

import messages from "../../src/i18n/messages/id.json";

const mailpit = process.env.MAILPIT_URL ?? "http://localhost:8026";

test("protected pages require a session", async ({ page }) => {
  await page.goto("/people");
  await expect(page).toHaveURL(/\/login\?next=/);
  await expect(page.getByLabel(messages.auth.email, { exact: true })).toBeVisible();
});

test("email login and onboarding retain the requested destination", async ({ page, request }) => {
  const email = `auth-${crypto.randomUUID()}@example.test`;
  await page.goto(`/login?next=${encodeURIComponent("/manifest.webmanifest")}`);
  await page.getByLabel(messages.auth.email, { exact: true }).fill(email);
  await page.getByRole("button", { name: messages.auth.sendCode, exact: true }).click();
  await expect(page.getByLabel(messages.auth.code, { exact: true })).toBeVisible();
  let code: string | undefined;
  await expect
    .poll(async () => {
      const result = await request.get(`${mailpit}/api/v1/search`, { params: { query: `to:"${email}"` } });
      const { messages: entries } = (await result.json()) as { messages: Array<{ ID: string }> };
      if (!entries[0]) return false;
      const message = (await (await request.get(`${mailpit}/api/v1/message/${entries[0].ID}`)).json()) as {
        Text: string;
      };
      code = message.Text.match(/\b\d{6}\b/)?.[0];
      return Boolean(code);
    })
    .toBe(true);
  const invalid = `${code![0] === "9" ? "0" : "9"}${code!.slice(1)}`;
  await page.getByLabel(messages.auth.code, { exact: true }).fill(invalid);
  await expect(page.getByRole("alert").filter({ hasText: messages.auth.invalidCode })).toHaveText(
    messages.auth.invalidCode,
  );
  await page.getByLabel(messages.auth.code, { exact: true }).fill(code!);
  await expect(page).toHaveURL(/\/onboarding\?/);
  await page.getByLabel(messages.onboarding.name, { exact: true }).fill("Ani Putri");
  await page.getByRole("button", { name: messages.onboarding.start, exact: true }).click();
  await expect(page).toHaveURL(/\/manifest.webmanifest$/);
  await page.goto(`/onboarding?next=${encodeURIComponent("/manifest.webmanifest")}`);
  await expect(page).toHaveURL(/\/manifest.webmanifest$/);
});
