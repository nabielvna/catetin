"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";

export function ProfileForm({
  name,
  setName,
  pending,
  onSubmit,
  children,
}: {
  name: string;
  setName: (value: string) => void;
  pending: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("account");
  const tc = useTranslations("common");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <DrawerHeader>
        <DrawerTitle>{t("name")}</DrawerTitle>
      </DrawerHeader>
      <div className="flex flex-col gap-4 px-5">
        {children}
        <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>
      <DrawerFooter>
        <Button type="submit" disabled={pending || !name.trim()}>
          {tc("save")}
        </Button>
      </DrawerFooter>
    </form>
  );
}
