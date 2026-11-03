"use client";
import {
  Ban,
  Bell,
  ChevronRight,
  Clock,
  Coins,
  Download,
  FileText,
  Globe,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  MonitorSmartphone,
  SunMoon,
  Trash2,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { feedback, removeAccount, saveProfile } from "@/actions/account";
import { unsubscribePush } from "@/actions/notifications";
import { ProfileForm } from "@/app/[locale]/(main)/account/profile-form";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { CurrencySheet } from "@/components/forms/currency-picker";
import { OptionSheet } from "@/components/forms/option-sheet";
import { useAction } from "@/components/forms/use-action";
import { SettingsGroup, SettingsRow } from "@/components/layout/settings";
import { InitialSkeleton } from "@/components/layout/skeletons";
import { Initial } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { GoogleIcon } from "@/components/ui/google-icon";
import { Input } from "@/components/ui/input";
import { SkeletonText } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { Currency } from "@/domain/money";
import { usePathname, useRouter } from "@/i18n/navigation";
import { switchLocale } from "@/i18n/switch-locale";
import { authClient } from "@/integrations/auth/client";
import { disablePush, type PushState, pushState } from "@/integrations/push/client";
import { timezoneOptions, tzName } from "@/lib/timezones";

const LANGUAGES = { id: "Indonesia", en: "English" } as const;
const THEMES = ["system", "light", "dark"] as const;
const hh = (h: number) => `${String(h).padStart(2, "0")}.00`;

export function AccountView({
  actor,
  deviceCount,
  google,
  quiet,
  vapidPublicKey,
}: {
  actor: { name: string; email: string; locale: string; currency: string; timezone: string };
  deviceCount: number;

  google: { linkedAt: string | null } | null;
  quiet: { start: number; end: number };
  vapidPublicKey: string | null;
}) {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const tc = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const format = useFormatter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [picker, setPicker] = useState<"locale" | "currency" | "timezone" | "theme" | null>(null);
  const [sheet, setSheet] = useState<"name" | "feedback" | "delete" | "signIn" | null>(null);
  const [name, setName] = useState(actor.name);
  const [message, setMessage] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [push, setPush] = useState<PushState | null>(null);
  const { pending, run } = useAction();
  const [linking, setLinking] = useState(false);

  const review = useReview<{ action: string; name?: string; message?: string }>({
    tools: ["updateSettings"],
    match: (i) => (i.action === "PROFILE" && i.name !== undefined) || i.action === "FEEDBACK",
    apply: (i) => {
      if (i.action === "FEEDBACK") {
        setMessage(i.message ?? "");
        setSheet("feedback");
      } else {
        setName(i.name ?? actor.name);
        setSheet("name");
      }
    },
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    void pushState(vapidPublicKey).then(setPush, () => setPush("unsupported"));
  }, [vapidPublicKey]);

  useEffect(() => {
    const linked = params.get("linked");
    const error = params.get("error");
    if (!linked && !error) return;
    if (linked) toast.success(t("googleLinked"));
    else if (error !== "access_denied")
      toast.error(
        error === "email_does_not_match" ? t("googleWrongEmail", { email: actor.email }) : t("googleLinkFailed"),
      );
    router.replace("/account");
  }, [params, router, t, actor.email]);

  function linkGoogle() {
    setLinking(true);
    void authClient
      .linkSocial({ provider: "google", callbackURL: "/account?linked=google", errorCallbackURL: "/account" })
      .then((res) => {
        if (res?.error) {
          setLinking(false);
          toast.error(t("googleLinkFailed"));
        }
      });
  }

  async function signOut() {
    await disablePush(unsubscribePush).catch(() => {});
    navigator.serviceWorker?.controller?.postMessage("clear-pages");
    await authClient.signOut();
    window.location.replace("/");
  }

  const timezones = useMemo(
    () => (picker === "timezone" ? timezoneOptions(actor.timezone) : []),
    [picker, actor.timezone],
  );
  const quietText =
    quiet.start === quiet.end ? t("quietOffShort") : t("quietRange", { start: hh(quiet.start), end: hh(quiet.end) });

  return (
    <div className="pb-10">
      <SettingsGroup className="pt-2">
        <button
          type="button"
          onClick={() => setSheet("name")}
          aria-label={t("editName")}
          data-tour="account.name"
          className="flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors hover:bg-foreground/4"
        >
          <Initial name={actor.name} className="size-14 text-xl" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-lg font-bold">{actor.name}</span>
            <span className="truncate text-[13px] text-muted-foreground">{actor.email}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </SettingsGroup>

      <SettingsGroup title={t("preferences")}>
        <SettingsRow
          icon={Globe}
          label={t("language")}
          value={LANGUAGES[actor.locale as keyof typeof LANGUAGES]}
          onClick={() => setPicker("locale")}
          tour="account.language"
        />
        <SettingsRow
          icon={Coins}
          label={t("currency")}
          value={actor.currency}
          onClick={() => setPicker("currency")}
          tour="account.currency"
        />
        <SettingsRow
          icon={Clock}
          label={t("timezone")}
          value={tzName(actor.timezone)}
          onClick={() => setPicker("timezone")}
          tour="account.timezone"
        />
        <SettingsRow
          icon={SunMoon}
          label={t("theme")}
          value={mounted ? t(`themes.${(theme ?? "system") as (typeof THEMES)[number]}`) : ""}
          onClick={() => setPicker("theme")}
          tour="account.theme"
        />
      </SettingsGroup>

      <SettingsGroup title={t("notifications")}>
        <SettingsRow
          icon={Bell}
          label={t("notifications")}
          hint={push ? t("notifSummary", { push, quiet: quietText }) : quietText}
          href="/account/notifications"
          tour="account.notifications"
        />
      </SettingsGroup>

      <SettingsGroup title={t("security")}>
        <SettingsRow
          icon={KeyRound}
          label={t("signInMethods")}
          value={google?.linkedAt ? `Google · ${t("emailCode")}` : t("emailCode")}
          onClick={() => setSheet("signIn")}
          tour="account.signIn"
        />
        <SettingsRow
          icon={MonitorSmartphone}
          label={t("devices")}
          value={t("devicesCount", { count: deviceCount })}
          href="/account/devices"
          tour="account.devices"
        />
        <SettingsRow icon={Ban} label={t("blockedTitle")} href="/account/blocked" tour="account.blocked" />
      </SettingsGroup>

      <SettingsGroup title={t("more")}>
        <SettingsRow icon={Download} label={t("download")} href="/api/export/me" download tour="account.download" />
        <SettingsRow
          icon={MessageSquare}
          label={t("feedback")}
          onClick={() => setSheet("feedback")}
          tour="account.feedback"
        />
        <SettingsRow icon={FileText} label={t("legal")} href="/privacy" />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon={LogOut} label={ta("signOut")} trailing={false} onClick={() => void signOut()} />
      </SettingsGroup>
      <SettingsGroup className="pt-3">
        <SettingsRow
          icon={Trash2}
          label={t("deleteAccount")}
          tone="neg"
          trailing={false}
          onClick={() => setSheet("delete")}
          tour="account.delete"
        />
      </SettingsGroup>

      <OptionSheet
        open={picker === "locale"}
        onOpenChange={(o) => !o && setPicker(null)}
        title={t("language")}
        value={actor.locale as "id" | "en"}
        options={(Object.keys(LANGUAGES) as Array<keyof typeof LANGUAGES>).map((l) => ({
          value: l,
          label: LANGUAGES[l],
        }))}
        onSelect={(l) => run(() => saveProfile({ locale: l }), { onSuccess: () => switchLocale(l, pathname) })}
      />
      <CurrencySheet
        open={picker === "currency"}
        onOpenChange={(o) => !o && setPicker(null)}
        title={t("currency")}
        value={actor.currency as Currency}
        base={actor.currency as Currency}
        onSelect={(c) => run(() => saveProfile({ currency: c }), { success: t("saved") })}
      />
      <OptionSheet
        open={picker === "timezone"}
        onOpenChange={(o) => !o && setPicker(null)}
        title={t("timezone")}
        value={actor.timezone}
        options={timezones}
        onSelect={(z) => run(() => saveProfile({ timezone: z }), { success: t("saved") })}
        searchable
      />
      <OptionSheet
        open={picker === "theme"}
        onOpenChange={(o) => !o && setPicker(null)}
        title={t("theme")}
        value={(theme ?? "system") as (typeof THEMES)[number]}
        options={THEMES.map((x) => ({ value: x, label: t(`themes.${x}`) }))}
        onSelect={setTheme}
      />

      <Drawer open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        <DrawerContent data-tour={sheet ? `account.${sheet}.sheet` : undefined}>
          {sheet === "name" ? (
            <ProfileForm
              name={name}
              setName={setName}
              pending={pending}
              onSubmit={() => {
                run(() => saveProfile({ name: name.trim() }), {
                  success: t("saved"),
                  onSuccess: () => {
                    void review.finish();
                    setSheet(null);
                  },
                });
              }}
            >
              <ReviewBanner review={review} />
            </ProfileForm>
          ) : null}
          {sheet === "feedback" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(() => feedback({ message, context: { path: pathname, ua: navigator.userAgent } }), {
                  success: t("feedbackSent"),
                  onSuccess: () => {
                    void review.finish();
                    setMessage("");
                    setSheet(null);
                  },
                });
              }}
            >
              <DrawerHeader>
                <DrawerTitle>{t("feedback")}</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-4 px-5">
                <ReviewBanner review={review} />
                <Textarea
                  autoFocus
                  value={message}
                  maxLength={5000}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t("feedbackPlaceholder")}
                  className="min-h-32"
                />
              </div>
              <DrawerFooter>
                <Button type="submit" disabled={pending || !message.trim()}>
                  {tc("save")}
                </Button>
              </DrawerFooter>
            </form>
          ) : null}
          {sheet === "signIn" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{t("signInMethods")}</DrawerTitle>
                <DrawerDescription>{t("signInMethodsHint")}</DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-6">
                <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg bg-soft">
                  <SettingsRow
                    icon={Mail}
                    label={t("emailCode")}
                    hint={actor.email}
                    trailing={<span className="text-[13px] text-muted-foreground">{t("alwaysOn")}</span>}
                  />
                  {google ? (
                    <div className="flex min-h-14 items-center gap-3.5 px-4 py-3">
                      <GoogleIcon className="size-5 shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] font-medium">Google</span>
                        <span className="text-[13px] leading-snug text-muted-foreground">
                          {google.linkedAt
                            ? t("googleSince", {
                                date: format.dateTime(new Date(google.linkedAt), {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }),
                              })
                            : t("googleNotLinked")}
                        </span>
                      </span>
                      {google.linkedAt ? null : (
                        <Button size="sm" variant="outline" onClick={linkGoogle} disabled={linking}>
                          {linking ? <Loader2 className="animate-spin" /> : null}
                          {t("googleLink")}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
          {sheet === "delete" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{t("deleteAccount")}</DrawerTitle>
                <DrawerDescription>{t("deleteHint", { name: actor.name })}</DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-2 px-5">
                <span className="text-[13px] text-muted-foreground">{t("deleteConfirm")}</span>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
              </div>
              <DrawerFooter>
                <Button
                  variant="destructive"
                  disabled={pending || !["HAPUS", "DELETE"].includes(confirmText.trim())}
                  onClick={() =>
                    run(() => removeAccount({ confirm: confirmText.trim() as "HAPUS" }), {
                      onSuccess: () => {
                        window.location.replace("/");
                      },
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {t("deleteAccount")}
                </Button>
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export function AccountSkeleton() {
  const t = useTranslations("account");
  const ta = useTranslations("auth");
  const chevron = <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
  const value = (w: string) => <SkeletonText w={w} className="bg-background" />;
  return (
    <div className="pb-10" aria-busy>
      <SettingsGroup className="pt-2">
        <div className="flex w-full items-center gap-3.5 px-4 py-4">
          <InitialSkeleton className="size-14 bg-background" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-lg font-bold">{value("7em")}</span>
            <span className="truncate text-[13px] text-muted-foreground">{value("18ch")}</span>
          </span>
          {chevron}
        </div>
      </SettingsGroup>

      <SettingsGroup title={t("preferences")}>
        <SettingsRow icon={Globe} label={t("language")} value={value("8ch")} trailing={chevron} />
        <SettingsRow icon={Coins} label={t("currency")} value={value("3ch")} trailing={chevron} />
        <SettingsRow icon={Clock} label={t("timezone")} value={value("10ch")} trailing={chevron} />
        <SettingsRow icon={SunMoon} label={t("theme")} value={value("6ch")} trailing={chevron} />
      </SettingsGroup>

      <SettingsGroup title={t("notifications")}>
        <SettingsRow icon={Bell} label={t("notifications")} hint={value("20ch")} trailing={chevron} />
      </SettingsGroup>

      <SettingsGroup title={t("security")}>
        <SettingsRow icon={KeyRound} label={t("signInMethods")} value={value("9ch")} trailing={chevron} />
        <SettingsRow icon={MonitorSmartphone} label={t("devices")} value={value("10ch")} trailing={chevron} />
        <SettingsRow icon={Ban} label={t("blockedTitle")} trailing={chevron} />
      </SettingsGroup>

      <SettingsGroup title={t("more")}>
        <SettingsRow icon={Download} label={t("download")} trailing={chevron} />
        <SettingsRow icon={MessageSquare} label={t("feedback")} trailing={chevron} />
        <SettingsRow icon={FileText} label={t("legal")} trailing={chevron} />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon={LogOut} label={ta("signOut")} trailing={false} />
      </SettingsGroup>
      <SettingsGroup className="pt-3">
        <SettingsRow icon={Trash2} label={t("deleteAccount")} tone="neg" trailing={false} />
      </SettingsGroup>
    </div>
  );
}
