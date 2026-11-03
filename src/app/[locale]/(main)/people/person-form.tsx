"use client";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMAIL_MAX, NAME_MAX } from "@/domain/people";
export function PersonForm({
  name,
  email,
  setName,
  setEmail,
  pending,
  onSubmit,
}: {
  name: string;
  email: string;
  setName: (value: string) => void;
  setEmail: (value: string) => void;
  pending: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations("addPerson");
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          autoFocus
          required
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          type="email"
          maxLength={EMAIL_MAX}
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("emailPlaceholder")}
          autoComplete="off"
        />
        <p className="text-[13px] text-muted-foreground">{t("emailHint")}</p>
      </div>
      <Button type="submit" size="lg" disabled={pending || !name.trim()} data-tour="person.add.submit">
        {pending ? <Loader2 className="animate-spin" /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
