"use client";

import { ArrowLeftRight, HandCoins, ReceiptText, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { AssistantBar } from "@/components/assistant/assistant-bar";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useRouter } from "@/i18n/navigation";
import { createStore } from "@/lib/store";

const store = createStore({ isOpen: false });
export const newSheet = { open: () => store.set({ isOpen: true }), close: () => store.set({ isOpen: false }) };
export function useNewSheet<T>(sel: (s: { isOpen: boolean; open: () => void; close: () => void }) => T): T {
  const isOpen = store.useStore((s) => s.isOpen);
  return sel({ isOpen, open: newSheet.open, close: newSheet.close });
}

export function NewSheet() {
  const t = useTranslations("new");
  const router = useRouter();
  const isOpen = store.useStore((s) => s.isOpen);
  const options = [
    { key: "debt", icon: HandCoins, href: "/debts/new" },
    { key: "payment", icon: ArrowLeftRight, href: "/payments/new" },
    { key: "bill", icon: ReceiptText, href: "/bills/new" },
    { key: "group", icon: Users, href: "/groups/new" },
  ] as const;

  return (
    <Drawer open={isOpen} onOpenChange={(o) => store.set({ isOpen: o })}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{t("title")}</DrawerTitle>
        </DrawerHeader>
        <AssistantBar
          className="mx-5 mb-2"
          onLaunch={(open) => {
            store.set({ isOpen: false });
            window.setTimeout(open, 350);
          }}
        />
        <ul className="flex flex-col px-3 pb-6">
          {options.map(({ key, icon: Icon, href }) => (
            <li key={key}>
              <button
                type="button"
                data-tour={`new.${key}`}
                className="flex w-full items-center gap-4 rounded-md px-2 py-3 text-left hover:bg-soft"
                onClick={() => {
                  store.set({ isOpen: false });
                  router.push(href);
                }}
              >
                <span className="flex size-11 items-center justify-center rounded-md bg-soft">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex flex-col">
                  <span className="text-[15px] font-semibold">{t(key)}</span>
                  <span className="text-[13px] text-muted-foreground">{t(`${key}Hint`)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DrawerContent>
    </Drawer>
  );
}
