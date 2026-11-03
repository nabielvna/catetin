"use client";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { cancel, decideMany } from "@/actions/approvals";
import { readNotifications } from "@/actions/notifications";
import { RequestCard } from "@/app/[locale]/(main)/inbox/approval-card";
import { TrustDispute } from "@/components/approvals/trust-dispute";
import { useRequestText } from "@/components/approvals/use-request-text";
import { useAction } from "@/components/forms/use-action";
import { EmptyState } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DisputableItem } from "@/services/approvals/disputes";
import type { RequestItem } from "@/services/approvals/queries";
import type { NotificationItem } from "@/services/notifications/inbox";
type Tab = "action" | "waiting" | "notifications";

type RenderedNotification = NotificationItem & { text: { title: string; body: string } };

export function InboxView({
  awaiting,
  waiting,
  notifications,
  disputable,
}: {
  awaiting: RequestItem[];
  waiting: RequestItem[];
  notifications: RenderedNotification[];
  disputable: DisputableItem[];
}) {
  const t = useTranslations("inbox");

  const param = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(() =>
    param === "waiting" || param === "notifications"
      ? param
      : awaiting.length === 0 && disputable.length === 0 && param !== "action"
        ? "notifications"
        : "action",
  );
  const unread = notifications.filter((n) => !n.read).length;

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: "action", label: t("tabAction"), count: awaiting.length + disputable.length },
    { key: "waiting", label: t("tabWaiting"), count: waiting.length },
    { key: "notifications", label: t("tabNotifications"), count: unread },
  ];

  return (
    <>
      <div role="tablist" className="flex gap-5 overflow-x-auto border-b border-line px-5">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            aria-selected={tab === x.key}
            data-tour={`inbox.tab.${x.key}`}
            onClick={() => setTab(x.key)}
            className={cn(
              "-mb-px shrink-0 border-b-2 pb-2.5 text-sm whitespace-nowrap",
              tab === x.key ? "border-foreground font-bold" : "border-transparent font-medium text-muted-foreground",
            )}
          >
            {x.label}
            {x.count > 0 ? <span className="ml-1 text-muted-foreground">{x.count}</span> : null}
          </button>
        ))}
      </div>
      {tab === "action" ? (
        <>
          {disputable.length > 0 ? (
            <section className="px-5 pt-4">
              <h2 className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {t("trustedTitle")}
              </h2>
              <TrustDispute items={disputable} compact />
            </section>
          ) : null}
          {awaiting.length > 0 || disputable.length === 0 ? <AwaitingList items={awaiting} /> : null}
        </>
      ) : null}
      {tab === "waiting" ? <WaitingList items={waiting} /> : null}
      {tab === "notifications" ? <NotificationList items={notifications} /> : null}
    </>
  );
}

function AwaitingList({ items }: { items: RequestItem[] }) {
  const t = useTranslations("inbox");
  const { pending, run } = useAction();
  const byPerson = useMemo(() => {
    const m = new Map<string, { name: string; ids: string[] }>();
    for (const it of items) {
      if (!it.requesterId || it.kind !== "OBLIGATION_CREATE") continue;
      const e = m.get(it.requesterId) ?? { name: it.requesterName, ids: [] };
      e.ids.push(it.requestId);
      m.set(it.requesterId, e);
    }
    return [...m.values()].filter((e) => e.ids.length > 1);
  }, [items]);

  if (items.length === 0)
    return (
      <div className="px-5">
        <EmptyState body={t("emptyAction")} />
      </div>
    );
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-8">
      {byPerson.map((p) => (
        <Button
          key={p.name}
          variant="outline"
          disabled={pending}
          onClick={() => run(() => decideMany({ requestIds: p.ids, decision: "APPROVE" }))}
        >
          {t("approveAll", { name: p.name })} ({p.ids.length})
        </Button>
      ))}
      {items.map((it) => (
        <RequestCard key={it.requestId} item={it} />
      ))}
    </div>
  );
}

function WaitingList({ items }: { items: RequestItem[] }) {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const text = useRequestText();
  const { pending, run } = useAction();
  if (items.length === 0)
    return (
      <div className="px-5">
        <EmptyState body={t("emptyWaiting")} />
      </div>
    );
  return (
    <ul className="px-5 pb-8">
      {items.map((it) => (
        <li
          key={it.requestId}
          className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0"
        >
          <Link href={it.url} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold">{text(it, "waiting")}</span>
            <span className="truncate text-[13px] text-muted-foreground">
              {[it.title, relativeTime(it.createdAt, locale)].filter(Boolean).join(" · ")}
            </span>
          </Link>
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            data-tour="inbox.withdraw"
            onClick={() => run(() => cancel({ requestId: it.requestId }))}
          >
            {t("cancelRequest")}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function NotificationList({ items }: { items: RenderedNotification[] }) {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const { run } = useAction();
  const unreadIds = items.filter((n) => !n.read).map((n) => n.id);

  useEffect(() => {
    if (unreadIds.length === 0) return;
    const id = setTimeout(() => run(() => readNotifications({ ids: unreadIds.slice(0, 200) })), 1500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds.join(",")]);

  if (items.length === 0)
    return (
      <div className="px-5">
        <EmptyState body={t("emptyNotifications")} />
      </div>
    );
  return (
    <ul className="px-5 pb-8">
      {items.map((n) => (
        <li key={n.id} className="border-b border-line last:border-0">
          <Link href={n.payload.url} className="flex gap-3 py-3">
            <span
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-neg")}
              aria-hidden
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={cn("text-[15px]", n.read ? "font-medium" : "font-bold")}>{n.text.title}</span>
              {n.text.body ? <span className="text-[13px] text-muted-foreground">{n.text.body}</span> : null}
              <span className="text-xs text-muted-foreground">{relativeTime(n.createdAt, locale)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function InboxSkeleton({ tab = "action" }: { tab?: Tab }) {
  const t = useTranslations("inbox");
  const active = tab === "waiting" ? 1 : tab === "notifications" ? 2 : 0;
  const tabs = [t("tabAction"), t("tabWaiting"), t("tabNotifications")];
  return (
    <div aria-busy>
      <div className="flex gap-5 overflow-x-auto border-b border-line px-5" aria-hidden>
        {tabs.map((l, i) => (
          <span
            key={l}
            className={cn(
              "-mb-px shrink-0 border-b-2 pb-2.5 text-sm whitespace-nowrap",
              i === active ? "border-foreground font-bold" : "border-transparent font-medium text-muted-foreground",
            )}
          >
            {l}
          </span>
        ))}
      </div>
      {active === 0 ? (
        <div className="flex flex-col gap-3 px-4 pt-4 pb-8">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-lg bg-soft p-4">
              <div className="flex flex-col gap-1">
                {}
                <span className="text-[17px] leading-snug font-bold tracking-[-0.01em]">
                  <SkeletonText w="100%" className="bg-background" />
                  <br />
                  <SkeletonText w={i ? "10ch" : "14ch"} className="bg-background" />
                </span>
                <span className="text-[13px]">
                  <SkeletonText w="18ch" className="bg-background" />
                </span>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-11 flex-1 bg-background" />
                <Skeleton className="h-11 flex-2 bg-background" />
              </div>
            </div>
          ))}
        </div>
      ) : active === 1 ? (
        <ul className="px-5 pb-8">
          {["22ch", "18ch"].map((w) => (
            <li key={w} className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px] font-semibold">
                  <SkeletonText w={w} />
                </span>
                <span className="truncate text-[13px] text-muted-foreground">
                  <SkeletonText w="12ch" />
                </span>
              </div>
              <Button size="xs" variant="outline" tabIndex={-1} aria-hidden>
                {t("cancelRequest")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="px-5 pb-8">
          {["24ch", "18ch", "21ch"].map((w) => (
            <li key={w} className="border-b border-line last:border-0">
              <div className="flex gap-3 py-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-medium">
                    <SkeletonText w={w} />
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    <SkeletonText w="28ch" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <SkeletonText w="8ch" />
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
