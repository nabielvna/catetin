import { ArrowRight, BellRing, Scale, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/layout/logo";
import { Cover } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function Landing() {
  const t = await getTranslations("landing");
  const points = [
    { icon: Scale, text: t("points.shared") },
    { icon: Users, text: t("points.groups") },
    { icon: BellRing, text: t("points.reminders") },
  ];
  return (
    <Cover>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe">
        <header className="flex h-16 items-center">
          <Logo />
        </header>
        <section className="flex flex-1 flex-col justify-center gap-8 py-10">
          <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-[-0.045em] text-balance">
            {t("headline")}
          </h1>
          <p className="text-base text-pretty text-muted-foreground">{t("sub")}</p>
          <ul className="flex flex-col">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 border-b border-line py-3.5 last:border-0">
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="text-[15px] font-medium">{text}</span>
              </li>
            ))}
          </ul>
        </section>
        <footer className="flex flex-col gap-5 pb-safe-8">
          <Button asChild size="lg" className="w-full">
            <Link href="/login">
              {t("cta")} <ArrowRight />
            </Link>
          </Button>
          <nav className="flex justify-center gap-5 text-[13px] text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              {t("privacy")}
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              {t("terms")}
            </Link>
          </nav>
        </footer>
      </main>
    </Cover>
  );
}
