"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const tc = useTranslations("common");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-extrabold tracking-[-0.03em]">{t("errorTitle")}</h1>
      <p className="text-[15px] text-muted-foreground">{t("errorBody")}</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">{error.digest}</p> : null}
      <Button className="self-start" onClick={reset}>
        {tc("retry")}
      </Button>
    </main>
  );
}
