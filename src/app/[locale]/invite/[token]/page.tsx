import { io } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AcceptInvite } from "@/app/[locale]/invite/[token]/accept-invite";
import { Logo } from "@/components/layout/logo";
import { Cover } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { isDomainError } from "@/domain/errors";
import { Link } from "@/i18n/navigation";
import { getActor } from "@/services/auth";
import { type InvitePreview, previewInvite, USER_INVITE_PREFIX } from "@/services/invites";

export default function InvitePage(props: PageProps<"/[locale]/invite/[token]">) {
  return (
    <Cover>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe">
        <header className="flex h-16 items-center">
          <Logo />
        </header>
        <Suspense fallback={<InviteSkeleton />}>
          <Content params={props.params} />
        </Suspense>
      </main>
    </Cover>
  );
}

async function Content({ params }: { params: Promise<{ token: string }> }) {
  await io();
  const { token } = await params;
  const t = await getTranslations("invite");
  const ta = await getTranslations("auth");
  const locale = await getLocale();
  const actor = await getActor();

  if (!actor && token.startsWith(USER_INVITE_PREFIX)) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-6 pb-16">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.035em]">{t("mergeLogin")}</h1>
        <Button asChild size="lg">
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>{ta("title")}</Link>
        </Button>
      </div>
    );
  }
  let preview: InvitePreview;
  try {
    preview = await previewInvite(token, new Date(), actor?.userId ?? null);
  } catch (e) {
    if (!isDomainError(e)) throw e;
    return <p className="pt-10 text-[15px] text-muted-foreground">{t("invalid")}</p>;
  }

  if (!actor) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-6 pb-16">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.035em]">
          {preview.kind === "GROUP"
            ? t("groupTitle", { group: preview.groupName ?? "" })
            : t("claimTitle", { inviter: preview.inviterName })}
        </h1>
        <p className="text-[15px] text-muted-foreground">{ta("invitedBy", { name: preview.inviterName })}</p>
        <Button asChild size="lg">
          <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>{ta("title")}</Link>
        </Button>
      </div>
    );
  }
  return <AcceptInvite token={token} preview={preview} locale={locale} />;
}

function InviteSkeleton() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 pb-16" aria-busy>
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.035em]">
        <SkeletonText w="9em" />
        <br />
        <SkeletonText w="5em" />
      </h1>
      <p className="text-[15px] text-muted-foreground">
        <SkeletonText w="20ch" />
      </p>
      <Skeleton className="h-14 rounded-md" />
    </div>
  );
}
