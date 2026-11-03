"use client";
import { Ellipsis, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense, use, useState } from "react";

import { addGroupMembers, kick, setRole } from "@/actions/groups";
import { ReviewBanner, type ReviewHook } from "@/components/assistant/review";
import { MemberPicker, MemberPickerSkeleton, type MemberSelection } from "@/components/forms/member-picker";
import { useAction } from "@/components/forms/use-action";
import { Initial } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { GroupDetail } from "@/services/groups/queries";
import type { PickablePerson } from "@/services/people/queries";
export function Members({
  group,
  people,
  prefill,
  review,
}: {
  group: GroupDetail;
  people: Promise<PickablePerson[]>;

  prefill: MemberSelection | null;
  review: ReviewHook;
}) {
  const t = useTranslations("groups");
  const tp = useTranslations("people");
  const tc = useTranslations("common");
  const [adding, setAdding] = useState(prefill !== null);
  const [sel, setSel] = useState<MemberSelection>(prefill ?? { ids: [], manual: [] });
  const [seen, setSeen] = useState(prefill);

  if (prefill !== seen) {
    setSeen(prefill);
    if (prefill) {
      setSel(prefill);
      setAdding(true);
    }
  }
  const { pending, run } = useAction();
  const admin = group.myRole === "ADMIN";
  return (
    <div className="flex flex-col px-5 pb-8">
      <ul>
        {group.members.map((m) => (
          <li key={m.partyId} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
            <Initial
              name={m.name}
              className={`size-9 text-sm ${m.state === "USER" ? "" : "bg-soft text-foreground"}`}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-semibold">{m.isMe ? `${m.name} (${t("you")})` : m.name}</span>
              <span className="text-xs text-muted-foreground">
                {[
                  m.role === "ADMIN" ? t("admin") : null,
                  m.status === "INVITED" ? t("invited") : m.status === "PENDING" ? t("pendingApproval") : null,
                  m.state === "MANUAL" ? tp("manual") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {admin && !m.isMe ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={tc("more")}
                    data-tour="group.member.menu"
                    className="flex size-10 items-center justify-center rounded-md hover:bg-soft"
                  >
                    <Ellipsis className="size-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {m.state === "USER" && m.status === "ACTIVE" ? (
                    <DropdownMenuItem
                      data-tour="group.member.role"
                      onSelect={() =>
                        run(() =>
                          setRole({
                            groupId: group.id,
                            partyId: m.partyId,
                            role: m.role === "ADMIN" ? "MEMBER" : "ADMIN",
                          }),
                        )
                      }
                    >
                      {m.role === "ADMIN" ? t("removeAdmin") : t("makeAdmin")}
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    variant="destructive"
                    data-tour="group.member.remove"
                    onSelect={() => run(() => kick({ groupId: group.id, partyId: m.partyId }))}
                  >
                    {t("remove")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </li>
        ))}
        {group.guests.map((g) => (
          <li key={g.partyId} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
            <Initial name={g.name} className="size-9 bg-soft text-sm text-foreground" />
            <span className="flex-1 truncate text-[15px] font-medium">{g.name}</span>
            <span className="text-xs text-muted-foreground">{t("guest")}</span>
          </li>
        ))}
      </ul>
      {!group.archived ? (
        adding ? (
          <div className="flex flex-col gap-3 pt-4">
            <ReviewBanner review={review} />
            <Suspense fallback={<MemberPickerSkeleton />}>
              <Picker people={people} value={sel} onChange={setSel} exclude={group.members.map((m) => m.partyId)} />
            </Suspense>
            <Button
              data-tour="group.members.submit"
              disabled={pending || (sel.ids.length === 0 && sel.manual.length === 0)}
              onClick={() =>
                run(() => addGroupMembers({ groupId: group.id, memberIds: sel.ids, newManual: sel.manual }), {
                  onSuccess: () => {
                    void review.finish();
                    setAdding(false);
                    setSel({ ids: [], manual: [] });
                  },
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("addMembers")}
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="mt-4" data-tour="group.members.add" onClick={() => setAdding(true)}>
            {t("addMembers")}
          </Button>
        )
      ) : null}
    </div>
  );
}

function Picker({
  people,
  ...rest
}: { people: Promise<PickablePerson[]> } & Omit<React.ComponentProps<typeof MemberPicker>, "people">) {
  return <MemberPicker people={use(people)} {...rest} />;
}
