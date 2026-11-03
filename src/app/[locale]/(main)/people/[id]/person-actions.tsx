"use client";

import { Bell, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { remind } from "@/actions/people";
import { useAction } from "@/components/forms/use-action";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function PersonActions(props: {
  partyId: string;
  pairId: string | null;
  name: string;
  theyOwe: boolean;
  iOwe: boolean;
  canRemind: boolean;
  state: "USER" | "MANUAL" | "DELETED";
}) {
  const t = useTranslations("person");
  const { pending, run } = useAction();
  const primary = props.iOwe
    ? { label: t("pay"), href: `/payments/new?with=${props.partyId}&dir=out` }
    : { label: t("receive"), href: `/payments/new?with=${props.partyId}&dir=in` };
  return (
    <div className="flex gap-2">
      {props.theyOwe || props.iOwe ? (
        <Button asChild className="flex-2">
          <Link href={primary.href} data-tour={props.iOwe ? "person.pay" : "person.receive"}>
            {primary.label}
          </Link>
        </Button>
      ) : null}
      <Button asChild variant={props.theyOwe || props.iOwe ? "outline" : "default"} className="flex-2">
        <Link href={`/debts/new?with=${props.partyId}`} data-tour="person.record">
          {t("record")}
        </Link>
      </Button>
      {props.canRemind ? (
        <Button
          variant="outline"
          size="icon"
          aria-label={t("remind", { name: props.name })}
          data-tour="person.remind"
          disabled={pending}
          onClick={() => run(() => remind({ partyId: props.partyId }), { success: t("reminded") })}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Bell className="size-5" strokeWidth={1.8} />}
        </Button>
      ) : null}
    </div>
  );
}
