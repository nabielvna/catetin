"use client";

import { Ellipsis, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { archiveContact, block, merge, removeContact, rename, setEmail } from "@/actions/people";
import { useAction } from "@/components/forms/use-action";
import { InviteSheet } from "@/components/people/invite-sheet";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EMAIL_MAX, NAME_MAX } from "@/domain/people";
import { Link, useRouter } from "@/i18n/navigation";
import { downloadOrShare } from "@/lib/share-file";
import type { PersonCore, PersonHeader } from "@/services/people/queries";

type Sheet = "rename" | "email" | "invite" | "block" | "merge" | "delete" | null;
type Candidate = { partyId: string; name: string; state: "USER" | "MANUAL" };

export function PersonMenu({
  header,
  autoInvite,
  candidates,
}: {
  header: PersonCore & Pick<PersonHeader, "hasRecords">;
  autoInvite: boolean;
  candidates: Candidate[];
}) {
  const t = useTranslations("person");
  const tc = useTranslations("common");
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [value, setValue] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Candidate | null>(null);
  const { pending, run } = useAction();
  const first = header.name.split(" ")[0] ?? header.name;
  const canInvite = header.state === "MANUAL";
  const mine = header.isMyManualContact;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? candidates.filter((c) => c.name.toLowerCase().includes(q)) : candidates;
  }, [candidates, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoInvite && canInvite) setSheet("invite");
  }, [autoInvite, canInvite]);

  const close = () => {
    setSheet(null);
    setTarget(null);
    setQuery("");
  };

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tc("more")}
            data-tour="person.menu"
            className="flex size-11 items-center justify-center rounded-md hover:bg-soft"
          >
            <Ellipsis className="size-6" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {canInvite ? (
            <DropdownMenuItem data-tour="person.menu.invite" onSelect={() => setSheet("invite")}>
              {t("invite", { name: first })}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            data-tour="person.menu.rename"
            onSelect={() => {
              setValue(header.name);
              setSheet("rename");
            }}
          >
            {t("rename")}
          </DropdownMenuItem>
          {mine ? (
            <DropdownMenuItem
              data-tour="person.menu.email"
              onSelect={() => {
                setValue(header.email ?? "");
                setSheet("email");
              }}
            >
              {t("setEmail")}
            </DropdownMenuItem>
          ) : null}
          {header.pairId ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-tour="person.menu.pdf"
                onSelect={() =>
                  void downloadOrShare(`/api/exports/people/${header.partyId}/pdf`, "catetin.pdf", header.name)
                }
              >
                {t("downloadPdf")}
              </DropdownMenuItem>
              <DropdownMenuItem asChild data-tour="person.menu.print">
                <Link href={`/people/${header.partyId}/statement`}>{t("print")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild data-tour="person.menu.csv">
                <a href={`/api/exports/people/${header.partyId}`} download>
                  {t("exportCsv")}
                </a>
              </DropdownMenuItem>
            </>
          ) : null}
          {mine ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem data-tour="person.menu.merge" onSelect={() => setSheet("merge")}>
                {t("merge.menu")}
              </DropdownMenuItem>
              {header.hasRecords ? (
                <DropdownMenuItem
                  data-tour="person.menu.archive"
                  onSelect={() =>
                    run(() => archiveContact({ partyId: header.partyId, archived: !header.archived }), {
                      success: header.archived ? t("archive.restored") : t("archive.done", { name: first }),
                      onSuccess: () => (header.archived ? undefined : router.replace("/people")),
                    })
                  }
                >
                  {header.archived ? t("archive.restore") : t("archive.menu")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  data-tour="person.menu.delete"
                  onSelect={() => setSheet("delete")}
                >
                  {t("remove.menu")}
                </DropdownMenuItem>
              )}
            </>
          ) : null}
          {header.state === "USER" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-tour="person.menu.block"
                variant={header.blocked ? "default" : "destructive"}
                onSelect={() =>
                  header.blocked
                    ? run(() => block({ partyId: header.partyId, blocked: false }), {
                        success: t("block.unblocked", { name: first }),
                      })
                    : setSheet("block")
                }
              >
                {header.blocked ? t("block.unblock") : t("block.menu", { name: first })}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Drawer open={sheet === "rename" || sheet === "email"} onOpenChange={(o) => !o && close()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{sheet === "email" ? t("setEmail") : t("rename")}</DrawerTitle>
            {sheet === "rename" && !mine ? <DrawerDescription>{t("renameHint")}</DrawerDescription> : null}
          </DrawerHeader>
          <form
            className="flex flex-col"
            data-tour={sheet === "email" ? "person.email.form" : "person.rename.form"}
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () =>
                  sheet === "email"
                    ? setEmail({ partyId: header.partyId, email: value.trim() || null })
                    : rename({ partyId: header.partyId, name: value.trim() }),
                {
                  onSuccess: () => {
                    close();
                  },
                },
              );
            }}
          >
            <div className="flex flex-col gap-4 px-5">
              <Input
                autoFocus
                aria-label={sheet === "email" ? t("setEmail") : t("rename")}
                type={sheet === "email" ? "email" : "text"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={sheet === "email" ? EMAIL_MAX : NAME_MAX}
                required={sheet === "rename"}
              />
            </div>
            <DrawerFooter>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {tc("save")}
              </Button>
            </DrawerFooter>
          </form>
        </DrawerContent>
      </Drawer>

      {}
      <Drawer open={sheet === "block"} onOpenChange={(o) => !o && close()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("block.title", { name: first })}</DrawerTitle>
            <DrawerDescription>{t("block.body", { name: first })}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              variant="destructive"
              disabled={pending}
              data-tour="person.block.confirm"
              onClick={() =>
                run(() => block({ partyId: header.partyId, blocked: true }), {
                  success: t("block.done", { name: first }),
                  onSuccess: close,
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {t("block.confirm")}
            </Button>
            <Button variant="ghost" onClick={close}>
              {tc("cancel")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {}
      <Drawer open={sheet === "delete"} onOpenChange={(o) => !o && close()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("remove.title", { name: first })}</DrawerTitle>
            <DrawerDescription>{t("remove.body")}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              variant="destructive"
              disabled={pending}
              data-tour="person.delete.confirm"
              onClick={() =>
                run(() => removeContact({ partyId: header.partyId }), {
                  success: t("remove.done"),
                  onSuccess: () => router.replace("/people"),
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {tc("delete")}
            </Button>
            <Button variant="ghost" onClick={close}>
              {tc("cancel")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {}
      <Drawer open={sheet === "merge"} onOpenChange={(o) => !o && close()}>
        <DrawerContent className="max-h-[85dvh]">
          {target ? (
            <>
              <DrawerHeader>
                <DrawerTitle>{t("merge.confirmTitle", { from: header.name, to: target.name })}</DrawerTitle>
                <DrawerDescription>
                  {target.state === "USER"
                    ? t("merge.userBody", { from: header.name, to: target.name })
                    : t("merge.manualBody", { from: header.name, to: target.name })}
                </DrawerDescription>
              </DrawerHeader>
              <DrawerFooter>
                <Button
                  disabled={pending}
                  data-tour="person.merge.confirm"
                  onClick={() =>
                    run(() => merge({ sourceId: header.partyId, targetId: target.partyId }), {
                      success: (d) =>
                        d.status === "MERGED" ? t("merge.done") : t("merge.sent", { name: target.name }),
                      onSuccess: (d) => {
                        close();
                        if (d.status === "MERGED") router.replace(`/people/${target.partyId}`);
                      },
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : null}
                  {target.state === "USER" ? t("merge.send") : t("merge.confirm")}
                </Button>
                <Button variant="ghost" onClick={() => setTarget(null)}>
                  {tc("back")}
                </Button>
              </DrawerFooter>
            </>
          ) : (
            <>
              <DrawerHeader>
                <DrawerTitle>{t("merge.title", { name: first })}</DrawerTitle>
                <DrawerDescription>{t("merge.hint", { name: first })}</DrawerDescription>
              </DrawerHeader>
              <div className="relative px-5">
                <Search className="pointer-events-none absolute top-1/2 left-8 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tc("search")}
                  className="pl-9"
                />
              </div>
              <ul className="overflow-y-auto px-5 pb-6" data-tour="person.merge.list">
                {filtered.length === 0 ? (
                  <li className="py-4 text-sm text-muted-foreground">{tc("noResults")}</li>
                ) : (
                  filtered.map((c) => (
                    <li key={c.partyId} className="border-b border-line last:border-0">
                      <button
                        type="button"
                        onClick={() => setTarget(c)}
                        className="flex w-full items-center gap-3 py-3 text-left"
                      >
                        <Initial
                          name={c.name}
                          className={c.state === "USER" ? "size-9 text-sm" : "size-9 bg-soft text-sm text-foreground"}
                        />
                        <span className="flex-1 truncate text-[15px] font-medium">{c.name}</span>
                        <span className="text-[12.5px] text-muted-foreground">
                          {c.state === "USER" ? t("merge.user") : t("merge.manual")}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          )}
        </DrawerContent>
      </Drawer>

      {canInvite ? (
        <InviteSheet
          open={sheet === "invite"}
          onOpenChange={(o) => setSheet(o ? "invite" : null)}
          partyId={header.partyId}
          name={first}
          email={header.email}
        />
      ) : null}
    </>
  );
}
