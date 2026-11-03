"use client";

import { FileDown, Loader2, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadOrShare } from "@/lib/share-file";

export function PrintButton(props: { label: string; pdfLabel: string; pdfHref: string; shareTitle: string }) {
  const te = useTranslations("errors");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await downloadOrShare(props.pdfHref, "catetin.pdf", props.shareTitle).catch(() => false);
          setBusy(false);
          if (!ok) toast.error(te("INTERNAL"));
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <FileDown />} {props.pdfLabel}
      </Button>
      <Button variant="ghost" size="icon" aria-label={props.label} onClick={() => window.print()}>
        <Printer />
      </Button>
    </div>
  );
}
