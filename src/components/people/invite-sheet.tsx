"use client";

import { Check, Copy, Loader2, Mail, QrCode, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useEffectEvent, useState } from "react";
import { toast } from "sonner";

import { makeInvite } from "@/actions/invites";
import { QrCodeSvg } from "@/components/people/qr-sheets";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

export function InviteSheet({
  open,
  onOpenChange,
  partyId,
  name,
  email,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  partyId: string;
  name: string;
  email: string | null;
}) {
  const t = useTranslations("invite");
  const te = useTranslations("errors");
  const [url, setUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const onError = useEffectEvent((code: Parameters<typeof te>[0]) => toast.error(te(code)));
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void makeInvite({ kind: "CLAIM", partyId }).then((res) => {
      if (!alive) return;
      if (res.ok) setUrl(res.data.url);
      else onError(res.code);
    });
    return () => {
      alive = false;
      setUrl(null);
      setShowQr(false);
      setCopied(false);
    };
  }, [open, partyId]);

  const shareText = url ? `${t("shareMessage")} ${url}` : "";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent data-tour="invite.sheet">
        <DrawerHeader>
          <DrawerTitle>{t("shareTitle", { name })}</DrawerTitle>
          <DrawerDescription>{showQr ? t("qrHint", { name }) : t("hint", { name })}</DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-5 pb-8">
          {!url ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="animate-spin" />
            </div>
          ) : showQr ? (
            <div className="mx-auto w-full max-w-70">
              <QrCodeSvg value={url} />
            </div>
          ) : (
            <>
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Button onClick={() => navigator.share({ text: shareText }).catch(() => {})}>
                  <Share2 /> {t("shareLink")}
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(shareText);
                  setCopied(true);
                }}
              >
                {copied ? <Check /> : <Copy />} {t("copyLink")}
              </Button>
              <Button variant="outline" onClick={() => setShowQr(true)}>
                <QrCode /> {t("showQr")}
              </Button>
              {email ? (
                <Button
                  variant="outline"
                  disabled={sending}
                  onClick={async () => {
                    setSending(true);
                    const res = await makeInvite({ kind: "CLAIM", partyId, sendEmail: true });
                    setSending(false);
                    if (res.ok) toast.success(t("emailSent", { email }));
                    else toast.error(te(res.code));
                  }}
                >
                  {sending ? <Loader2 className="animate-spin" /> : <Mail />} {t("sendEmail")}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
