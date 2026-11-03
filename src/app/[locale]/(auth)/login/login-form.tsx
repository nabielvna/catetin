"use client";

import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/integrations/auth/client";
import { safeNextPath } from "@/lib/safe-next";

const RESEND_SECONDS = 60;

export function LoginForm({ google }: { google: boolean }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(() => googleError(params.get("error"), t));
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const headers = { "x-catetin-locale": locale };
  const afterLogin = `/onboarding?next=${encodeURIComponent(next)}`;

  function sendCode() {
    setError(null);
    startTransition(async () => {
      const res = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" }, { headers });
      if (res.error) {
        setError(res.error.status === 429 ? t("tooMany") : (res.error.message ?? t("tooMany")));
        return;
      }
      setStep("code");
      setCooldown(RESEND_SECONDS);
    });
  }

  function verify(value = code) {
    setError(null);
    startTransition(async () => {
      const res = await authClient.signIn.emailOtp({ email: email.trim(), otp: value }, { headers });
      if (res.error) {
        setError(res.error.status === 429 ? t("tooMany") : t("invalidCode"));
        setCode("");
        return;
      }
      router.replace(afterLogin);
    });
  }

  function withGoogle() {
    startTransition(async () => {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${locale === "id" ? "" : `/${locale}`}${afterLogin}`,
        errorCallbackURL: `/login?next=${encodeURIComponent(next)}`,
      });
    });
  }

  if (step === "code") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-bold">{t("codeTitle")}</h2>
          <p className="text-[15px] text-muted-foreground">{t("codeSub", { email })}</p>
        </div>
        <InputOTP
          maxLength={6}
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6) verify(v);
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label={t("code")}
          containerClassName="justify-between"
        >
          <InputOTPGroup className="w-full justify-between gap-2">
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot key={i} index={i} className="h-14 flex-1 rounded-md border text-2xl font-bold" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error ? (
          <p className="text-sm font-medium text-neg" role="alert">
            {error}
          </p>
        ) : null}
        <Button size="lg" onClick={() => verify()} disabled={pending || code.length !== 6}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {t("verify")}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setStep("email")}
          >
            {t("changeEmail")}
          </button>
          <button
            type="button"
            className="font-semibold disabled:font-medium disabled:text-muted-foreground"
            disabled={cooldown > 0 || pending}
            onClick={sendCode}
          >
            {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {google ? (
        <>
          <Button size="lg" variant="outline" onClick={withGoogle} disabled={pending}>
            <GoogleIcon />
            {t("google")}
          </Button>
          <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
            <span className="h-px flex-1 bg-line" />
            {t("or")}
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          sendCode();
        }}
      >
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error ? (
          <p className="text-sm font-medium text-neg" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={pending || !email.includes("@")}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {t("sendCode")}
        </Button>
      </form>
      <p className="text-center text-[13px] text-muted-foreground">
        {t.rich("agree", {
          terms: (c) => (
            <Link href="/terms" className="underline">
              {c}
            </Link>
          ),
          privacy: (c) => (
            <Link href="/privacy" className="underline">
              {c}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}

function googleError(code: string | null, t: ReturnType<typeof useTranslations<"auth">>): string | null {
  if (!code || code === "access_denied") return null;
  return code === "account_not_linked" ? t("googleNotLinked") : t("googleFailed");
}
