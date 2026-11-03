import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LoginForm } from "@/app/[locale]/(auth)/login/login-form";
import { Logo } from "@/components/layout/logo";
import { Cover } from "@/components/records/record-parts";
import { googleEnabled } from "@/services/auth";

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <Cover>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe">
        <header className="flex h-16 items-center">
          <Logo />
        </header>
        <div className="flex flex-1 flex-col justify-center gap-8 pb-16">
          <div className="flex flex-col gap-2">
            <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.035em]">{t("title")}</h1>
            <p className="text-[15px] text-muted-foreground">{t("sub")}</p>
          </div>
          <Suspense>
            <LoginForm google={googleEnabled()} />
          </Suspense>
        </div>
      </main>
    </Cover>
  );
}
