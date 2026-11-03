"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { saveProfile } from "@/actions/account";
import { CurrencyField } from "@/components/forms/currency-picker";
import { OptionSheet } from "@/components/forms/option-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Currency } from "@/domain/money";
import { NAME_MAX } from "@/domain/people";
import { useRouter } from "@/i18n/navigation";
import { switchLocale } from "@/i18n/switch-locale";
import { guessCurrency, guessTimezone } from "@/lib/detect";

const LANGUAGES = { id: "Bahasa Indonesia", en: "English" } as const;

export function OnboardingForm({ name: initialName, next }: { name: string; next: string }) {
  const t = useTranslations("onboarding");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [currency, setCurrency] = useState<Currency>("IDR");
  const [language, setLanguage] = useState<keyof typeof LANGUAGES>(locale === "en" ? "en" : "id");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrency(guessCurrency(navigator.languages ?? [navigator.language]));
  }, []);

  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    start(async () => {
      const res = await saveProfile({
        name: name.trim(),
        currency,
        locale: language,
        timezone: guessTimezone(),
        onboarded: true,
      });
      if (!res.ok) {
        toast.error(te(res.code));
        return;
      }
      if (language === locale) router.replace(next);
      else switchLocale(language, next);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          required
          autoComplete="name"
        />
        <p className="text-[13px] text-muted-foreground">{t("nameHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="currency">{t("currency")}</Label>
        <CurrencyField id="currency" value={currency} onChange={setCurrency} base={currency} title={t("currency")} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="language">{t("language")}</Label>
        <button
          id="language"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={languageOpen}
          onClick={() => setLanguageOpen(true)}
          className="relative flex h-12 w-full items-center rounded-md border border-input bg-transparent pr-10 pl-3 text-left text-base outline-none focus-visible:border-foreground"
        >
          {LANGUAGES[language]}
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </button>
        <OptionSheet
          open={languageOpen}
          onOpenChange={setLanguageOpen}
          title={t("language")}
          value={language}
          options={(Object.keys(LANGUAGES) as Array<keyof typeof LANGUAGES>).map((value) => ({
            value,
            label: LANGUAGES[value],
          }))}
          onSelect={setLanguage}
        />
      </div>
      <Button type="submit" size="lg" disabled={pending || name.trim().length === 0} className="mt-2">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {t("start")}
      </Button>
    </form>
  );
}
