import { Logo } from "@/components/layout/logo";
import { Link } from "@/i18n/navigation";

export function LegalPage({
  title,
  updated,
  sections,
}: {
  title: string;
  updated: string;
  sections: Array<{ h: string; p: string[] }>;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 pt-safe pb-16">
      <header className="flex h-16 items-center">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <h1 className="text-3xl font-extrabold tracking-[-0.035em]">{title}</h1>
      <p className="pt-1 text-[13px] text-muted-foreground">{updated}</p>
      {sections.map((s) => (
        <section key={s.h} className="pt-6">
          <h2 className="pb-2 text-lg font-bold">{s.h}</h2>
          {s.p.map((x, i) => (
            <p key={i} className="pb-2 text-[15px] leading-relaxed text-pretty">
              {x}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
