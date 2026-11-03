import { type Browser, expect, type Page } from "@playwright/test";

const mailpit = process.env.MAILPIT_URL ?? "http://localhost:8026";

async function latestOtp(email: string, after: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const json = (await res.json()) as { messages: Array<{ ID: string; Created: string }> };
    const msg = json.messages.find((m) => new Date(m.Created).getTime() >= after - 2000);
    if (msg) {
      const full = (await (await fetch(`${mailpit}/api/v1/message/${msg.ID}`)).json()) as { Text: string };
      const code = full.Text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`OTP for ${email} not found`);
}

export async function login(page: Page, email: string, name: string, next?: string) {
  if (process.env.E2E_RUN_ID) email = email.replace("@", `+${process.env.E2E_RUN_ID}@`);
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByPlaceholder("nama@email.com").fill(email);
  const started = Date.now();
  await page.getByRole("button", { name: "Kirim kode" }).click();
  const code = await latestOtp(email, started);
  const verifyResponse = page.waitForResponse(
    (r) => r.url().includes("/api/auth/sign-in/email-otp") && r.request().method() === "POST",
  );
  await page.getByLabel("Kode").fill(code);
  const response = await verifyResponse;
  if (response.status() === 429) {
    const retryAfter = Number(response.headers()["retry-after"] ?? 60);
    await page.waitForTimeout((Number.isFinite(retryAfter) ? retryAfter + 1 : 61) * 1000);
    await page.getByLabel("Kode").fill(code);
  }
  await page.waitForURL(/\/(onboarding|home|invite|people)/);

  await page.waitForURL((u) => !u.pathname.includes("/onboarding"), { timeout: 4000 }).catch(() => {});
  if (page.url().includes("/onboarding")) {
    await page.getByLabel("Nama kamu").fill(name);
    await page.getByLabel("Mata uang utama").click();
    await page.getByRole("searchbox", { name: "Cari" }).fill("IDR");
    await page.getByRole("option", { name: /^IDR/ }).click();
    await page.getByRole("button", { name: "Mulai" }).click();
    await page.waitForURL((u) => !u.pathname.includes("/onboarding"));
  }
}

type StorageState = Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;

const sessions = new Map<string, StorageState>();

export async function newUser(browser: Browser, email: string, name: string, next?: string) {
  const saved = sessions.get(email);
  const ctx = await browser.newContext({
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    ...(saved ? { storageState: saved } : {}),
  });
  const page = await ctx.newPage();
  if (saved) {
    await page.goto(next ?? "/home");
  } else {
    await login(page, email, name, next);
    sessions.set(email, await ctx.storageState());
  }
  return page;
}

export async function recordDebt(
  page: Page,
  person: string,
  amount: string,
  title: string,
  dir: "they" | "me" = "they",
) {
  await page.goto("/debts/new");
  await page.getByRole("textbox", { name: "Dengan siapa" }).fill(person);
  await page
    .getByRole("button", { name: new RegExp(person) })
    .first()
    .click();
  if (dir === "me") await page.getByRole("radio", { name: "Aku pinjam" }).click();
  await page.getByLabel("Nominal").fill(amount);
  await page.getByLabel("Untuk apa").fill(title);
  await page.getByRole("button", { name: "Simpan" }).click();
  await page.waitForURL(/\/people\//);
}

export async function formReady(page: Page) {
  await expect(page.locator("main [inert]")).toHaveCount(0);
}

export async function expectText(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible();
}
