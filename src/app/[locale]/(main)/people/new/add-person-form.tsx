"use client";
import { QrCode, ScanLine } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { addPerson } from "@/actions/people";
import { PersonForm } from "@/app/[locale]/(main)/people/person-form";
import { useAction } from "@/components/forms/use-action";
import { ConnectQrSheet, ScanQrSheet } from "@/components/people/qr-sheets";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";

export function AddPersonForm() {
  const t = useTranslations("addPerson");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [qr, setQr] = useState<"show" | "scan" | null>(null);
  const { pending, run } = useAction();

  return (
    <div className="flex flex-col gap-8 px-5 pt-2">
      <PersonForm
        name={name}
        email={email}
        setName={setName}
        setEmail={setEmail}
        pending={pending}
        onSubmit={() => {
          run(() => addPerson({ name: name.trim(), email: email.trim() || null }), {
            success: t("created", { name: name.trim() }),
            onSuccess: (d) => {
              router.replace(`/people/${d.partyId}?invite=1`);
            },
          });
        }}
      />
      <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
        <span className="h-px flex-1 bg-line" />
        {t("or")}
        <span className="h-px flex-1 bg-line" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" data-tour="person.qr.scan" onClick={() => setQr("scan")}>
          <ScanLine /> {t("scanQr")}
        </Button>
        <Button variant="outline" data-tour="person.qr.show" onClick={() => setQr("show")}>
          <QrCode /> {t("showQr")}
        </Button>
      </div>
      <ConnectQrSheet open={qr === "show"} onOpenChange={(o) => setQr(o ? "show" : null)} />
      <ScanQrSheet open={qr === "scan"} onOpenChange={(o) => setQr(o ? "scan" : null)} />
    </div>
  );
}
