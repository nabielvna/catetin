"use client";
import { Check, Copy, Ellipsis, Loader2, Share2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, use, useState } from "react";
import { v7 as uuidv7 } from "uuid";

import { archive, changeMode, leave, rename, simplify as proposeSimplify } from "@/actions/groups";
import { makeInvite } from "@/actions/invites";
import { Members } from "@/app/[locale]/(main)/groups/[id]/group-members";
import { ReviewBanner, useReview } from "@/components/assistant/review";
import { type MemberSelection } from "@/components/forms/member-picker";
import { useAction } from "@/components/forms/use-action";
import { DatedRowSkeleton } from "@/components/layout/skeletons";
import { QrCodeSvg } from "@/components/people/qr-sheets";
import { Amount, DateBlock, Initial } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Currency } from "@/domain/money";
import { Link } from "@/i18n/navigation";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GroupDetail, GroupEntry } from "@/services/groups/queries";
import type { SimplifyPreview } from "@/services/groups/simplify";
import type { PickablePerson } from "@/services/people/queries";
type GroupReviewInput = {
  action: string;
  groupId?: string;
  name?: string;
  members?: Array<{ partyId?: string; newPersonName?: string }>;
};

type Sheet = "rename" | "mode" | "invite" | "add" | "leave" | "archive" | null;

export function GroupMenu({ group }: { group: GroupDetail }) {
  const t = useTranslations("groups");
  const tc = useTranslations("common");
  const ti = useTranslations("invite");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [name, setName] = useState(group.name);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { pending, run } = useAction();
  const admin = group.myRole === "ADMIN";

  const review = useReview<GroupReviewInput>({
    tools: ["manageGroup"],
    match: (i) => i.action === "RENAME" && i.groupId === group.id,
    apply: (i) => {
      setName(i.name ?? group.name);
      setSheet("rename");
    },
  });

  async function openInvite() {
    setSheet("invite");
    setLink(null);
    const res = await makeInvite({ kind: "GROUP", groupId: group.id });
    if (res.ok) setLink(res.data.url);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tc("more")}
            data-tour="group.menu"
            className="flex size-11 items-center justify-center rounded-md hover:bg-soft"
          >
            <Ellipsis className="size-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {!group.archived ? (
            <DropdownMenuItem data-tour="group.menu.invite" onSelect={() => void openInvite()}>
              {t("invite")}
            </DropdownMenuItem>
          ) : null}
          {admin ? (
            <DropdownMenuItem data-tour="group.menu.rename" onSelect={() => setSheet("rename")}>
              {t("rename")}
            </DropdownMenuItem>
          ) : null}
          {admin && !group.pendingModeChange ? (
            <DropdownMenuItem data-tour="group.menu.mode" onSelect={() => setSheet("mode")}>
              {t("changeMode")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {admin ? (
            <DropdownMenuItem data-tour="group.menu.archive" onSelect={() => setSheet("archive")}>
              {t("archive")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem variant="destructive" data-tour="group.menu.leave" onSelect={() => setSheet("leave")}>
            {t("leave")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Drawer open={sheet !== null} onOpenChange={(o) => !o && setSheet(null)}>
        <DrawerContent>
          {sheet === "rename" ? (
            <form
              data-tour="group.rename.form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => rename({ groupId: group.id, name: name.trim() }), {
                  onSuccess: () => {
                    void review.finish();
                    setSheet(null);
                  },
                });
              }}
            >
              <DrawerHeader>
                <DrawerTitle>{t("rename")}</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col gap-4 px-5">
                <ReviewBanner review={review} />
                <Input autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              </div>
              <DrawerFooter>
                <Button type="submit" disabled={pending || !name.trim()}>
                  {tc("save")}
                </Button>
              </DrawerFooter>
            </form>
          ) : null}
          {sheet === "mode" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{t("changeMode")}</DrawerTitle>
                <DrawerDescription>{t("changeModeHint")}</DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-2 px-5 pb-6" data-tour="group.mode.options">
                {(["CONFIRM", "TRUST"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={pending || m === group.mode}
                    onClick={() =>
                      run(() => changeMode({ groupId: group.id, mode: m }), { onSuccess: () => setSheet(null) })
                    }
                    className={cn(
                      "flex flex-col gap-0.5 rounded-md border px-4 py-3 text-left",
                      m === group.mode ? "border-foreground" : "border-border",
                    )}
                  >
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      {t(`modes.${m}`)} {m === group.mode ? <Check className="size-4" /> : null}
                    </span>
                    <span className="text-[13px] text-muted-foreground">{t(`modeHints.${m}`)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {sheet === "invite" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{t("invite")}</DrawerTitle>
                <DrawerDescription>{ti("groupSub", { inviter: "" }).trim()}</DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-3 px-5 pb-8">
                {link ? (
                  <>
                    <div className="mx-auto w-full max-w-60">
                      <QrCodeSvg value={link} />
                    </div>
                    {"share" in navigator ? (
                      <Button
                        data-tour="group.invite.share"
                        onClick={() => navigator.share({ text: `${group.name} — ${link}` }).catch(() => {})}
                      >
                        <Share2 /> {ti("shareLink")}
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      data-tour="group.invite.share"
                      onClick={async () => {
                        await navigator.clipboard.writeText(link);
                        setCopied(true);
                      }}
                    >
                      {copied ? <Check /> : <Copy />} {ti("copyLink")}
                    </Button>
                  </>
                ) : (
                  <div className="flex h-40 items-center justify-center">
                    <Loader2 className="animate-spin" />
                  </div>
                )}
              </div>
            </>
          ) : null}
          {sheet === "leave" || sheet === "archive" ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{sheet === "leave" ? t("leave") : t("archive")}</DrawerTitle>
                <DrawerDescription>{t("leaveBlocked")}</DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button
                  variant="destructive"
                  disabled={pending}
                  data-tour={sheet === "leave" ? "group.leave.confirm" : "group.archive.confirm"}
                  onClick={() =>
                    run<unknown>(
                      () => (sheet === "leave" ? leave({ groupId: group.id }) : archive({ groupId: group.id })),
                      { onSuccess: () => setSheet(null) },
                    )
                  }
                >
                  {tc("confirm")}
                </Button>
                <Button variant="ghost" onClick={() => setSheet(null)}>
                  {tc("cancel")}
                </Button>
              </DrawerFooter>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}

type Tab = "activity" | "balances" | "members";

export function GroupTabs({
  group,
  entries,
  people,
  simplify,
}: {
  group: GroupDetail;

  entries: Promise<GroupEntry[]>;
  people: Promise<PickablePerson[]>;
  simplify: Promise<SimplifyPreview[]>;
}) {
  const t = useTranslations("groups");
  const [tab, setTab] = useState<Tab>("activity");
  const [adding, setAdding] = useState<MemberSelection | null>(null);

  const review = useReview<GroupReviewInput>({
    tools: ["manageGroup"],
    match: (i) => i.action === "ADD_MEMBERS" && i.groupId === group.id,
    apply: (i) => {
      const inGroup = new Set(group.members.map((m) => m.partyId));
      const list = i.members ?? [];
      setAdding({
        ids: list.flatMap((m) => (m.partyId && !inGroup.has(m.partyId) ? [m.partyId] : [])),
        manual: list.flatMap((m) =>
          !m.partyId && m.newPersonName ? [{ id: uuidv7(), name: m.newPersonName.trim() }] : [],
        ),
      });
      setTab("members");
    },
  });
  return (
    <section className="mt-6">
      <div role="tablist" className="flex gap-5 border-b border-line px-5">
        {(["activity", "balances", "members"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            data-tour={`group.tab.${k}`}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 pb-2.5 text-sm",
              tab === k ? "border-foreground font-bold" : "border-transparent font-medium text-muted-foreground",
            )}
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      {tab === "activity" ? (
        <Suspense fallback={<EntriesSkeleton />}>
          <Entries entries={entries} />
        </Suspense>
      ) : null}
      {tab === "balances" ? (
        <>
          <Suspense>
            <SimplifyCards groupId={group.id} items={simplify} />
          </Suspense>
          <Balances group={group} />
        </>
      ) : null}
      {tab === "members" ? <Members group={group} people={people} prefill={adding} review={review} /> : null}
    </section>
  );
}

export function EntriesSkeleton() {
  return (
    <ul className="px-5 pb-8" aria-busy>
      <DatedRowSkeleton />
      <DatedRowSkeleton title="8ch" sub="13ch" />
      <DatedRowSkeleton title="13ch" />
    </ul>
  );
}

function Entries({ entries: promise }: { entries: Promise<GroupEntry[]> }) {
  const entries = use(promise);
  const locale = useLocale();
  const th = useTranslations("home");
  const tp = useTranslations("payment");
  if (entries.length === 0) return <p className="px-5 py-6 text-sm text-muted-foreground">{th("empty.body")}</p>;
  return (
    <ul className="px-5 pb-8">
      {entries.map((e) => {
        const href =
          e.kind === "BILL" ? `/bills/${e.id}` : e.kind === "SETTLEMENT" ? `/payments/${e.id}` : `/debts/${e.id}`;
        const sub =
          e.kind === "BILL"
            ? `${e.creditorName} · ${money(e.amount, e.currency, locale)}`
            : e.kind === "SETTLEMENT"
              ? `${e.debtorName} → ${e.creditorName}`
              : `${e.debtorName} → ${e.creditorName}`;
        return (
          <li key={`${e.kind}:${e.id}`} className="border-b border-line last:border-0">
            <Link href={href} className="flex items-center gap-3.5 py-3">
              <DateBlock date={e.date} locale={locale} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-semibold">
                  {e.kind === "SETTLEMENT" ? tp(`kind.${e.title as "PAYMENT"}`) : e.title}
                </span>
                <span className="truncate text-[13px] text-muted-foreground">{sub}</span>
              </div>
              {e.myShare !== 0 ? (
                <Amount value={e.myShare} currency={e.currency} locale={locale} className="text-[15px]" />
              ) : (
                <span className="text-[15px] font-bold num text-muted-foreground">
                  {money(e.amount, e.currency, locale)}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Balances({ group }: { group: GroupDetail }) {
  const locale = useLocale();
  const tm = useTranslations("money");
  const tg = useTranslations("groups");
  return (
    <ul className="px-5 pb-8">
      {group.members
        .filter((m) => m.status === "ACTIVE")
        .map((m) => {
          const entries = Object.entries(m.net) as Array<[Currency, number]>;
          return (
            <li key={m.partyId} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
              <Initial name={m.name} className="size-9 text-sm" />
              <span className="flex-1 truncate text-[15px] font-semibold">{m.isMe ? tg("you") : m.name}</span>
              {entries.length === 0 ? (
                <span className="text-[13px] text-muted-foreground">{tm("settled")}</span>
              ) : (
                <span className="flex flex-col items-end">
                  {entries.map(([c, v]) => (
                    <Amount key={c} value={v} currency={c} locale={locale} className="text-[15px]" />
                  ))}
                </span>
              )}
            </li>
          );
        })}
    </ul>
  );
}

function SimplifyCards({ groupId, items: promise }: { groupId: string; items: Promise<SimplifyPreview[]> }) {
  const items = use(promise);
  const t = useTranslations("simplify");
  const locale = useLocale();
  const { pending, run } = useAction();
  const useful = items.filter((i) => i.simplified < i.current || i.pendingRequestId);
  if (useful.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 px-4 pt-4">
      {useful.map((i) => (
        <section key={i.currency} className="flex flex-col gap-2.5 rounded-lg bg-soft p-4">
          <h3 className="text-[15px] font-bold">
            {t("title")}
            {items.length > 1 ? ` · ${i.currency}` : ""}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {t("explain", { current: i.current, simplified: i.simplified })}
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {i.transfers.map((tr, k) => (
              <li key={k} className="flex justify-between gap-3">
                <span className="truncate">
                  {tr.fromName} → {tr.toName}
                </span>
                <span className="font-semibold num">{money(tr.amount, i.currency, locale)}</span>
              </li>
            ))}
          </ul>
          {i.pendingRequestId ? (
            <p className="text-[13px] font-medium">{t("pending")}</p>
          ) : i.blockedByPending ? (
            <p className="text-[13px] text-muted-foreground">{t("blocked")}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("needsAll")}</p>
              <Button
                size="sm"
                disabled={pending}
                data-tour="group.simplify"
                onClick={() =>
                  run(() => proposeSimplify({ groupId, currency: i.currency }), {
                    success: (d) => (d.status === "APPLIED" ? t("applied") : t("proposed")),
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                {t("propose")}
              </Button>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
