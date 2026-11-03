import Link from "next/link";

import { Cover } from "@/components/records/record-parts";
import { Button } from "@/components/ui/button";

export function NotFoundView({ title, body, home }: { title: string; body: string; home: string }) {
  return (
    <Cover>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
        <h1 className="text-2xl font-extrabold tracking-[-0.03em]">{title}</h1>
        <p className="text-[15px] text-muted-foreground">{body}</p>
        <Button asChild className="self-start">
          <Link href="/home">{home}</Link>
        </Button>
      </main>
    </Cover>
  );
}
