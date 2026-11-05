import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuth } from "@/integrations/auth/server";

type OtpOptions = { sendVerificationOTP: (data: { email: string; otp: string }, ctx?: undefined) => Promise<void> };

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  error: vi.fn(),
  plugin: vi.fn<(options: OtpOptions) => { id: string }>(() => ({ id: "email-otp" })),
}));

vi.mock("better-auth/minimal", () => ({ betterAuth: vi.fn() }));
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: vi.fn() }));
vi.mock("better-auth/plugins/email-otp", () => ({ emailOTP: mocks.plugin }));
vi.mock("@/database/client", () => ({ db: {} }));
vi.mock("@/lib/server/env", () => ({
  env: () => ({ NODE_ENV: "production", APP_URL: "https://catetin.example", APP_ALLOWED_HOSTS: [] }),
}));
vi.mock("@/lib/server/logger", () => ({ log: { error: mocks.error } }));
vi.mock("@/integrations/email/send", () => ({ sendMail: mocks.send }));
vi.mock("@/integrations/email/templates/otp", () => ({
  otpEmail: async () => ({ subject: "Sign in", text: "Code", html: "Code" }),
}));

function sendOtp() {
  createAuth({ afterUserCreated: vi.fn(), afterSessionCreated: vi.fn(), loadAccount: vi.fn() });
  return mocks.plugin.mock.calls.at(-1)![0].sendVerificationOTP({ email: "test@example.com", otp: "123456" });
}

describe("OTP delivery lifetime", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps the callback pending until the SMTP server accepts the message", async () => {
    let accept!: () => void;
    mocks.send.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
    );
    let settled = false;
    const delivery = sendOtp().then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalled());
    expect(settled).toBe(false);
    accept();
    await delivery;
    expect(settled).toBe(true);
  });

  it("logs SMTP failure and rejects the callback so the auth framework can observe it", async () => {
    const failure = new Error("SMTP authentication failed");
    mocks.send.mockRejectedValueOnce(failure);
    await expect(sendOtp()).rejects.toBe(failure);
    expect(mocks.error).toHaveBeenCalledWith({ err: failure }, "otp email failed");
  });
});
