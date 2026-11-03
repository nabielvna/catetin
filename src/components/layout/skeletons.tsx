import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DateBlockSkeleton() {
  return (
    <div className="flex w-8.5 shrink-0 flex-col items-center" aria-hidden>
      <span className="text-lg leading-[1.1] font-bold num">
        <SkeletonText w="1.2em" />
      </span>
      <span className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">
        <SkeletonText w="2.6em" />
      </span>
    </div>
  );
}

export function InitialSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("size-11 shrink-0 rounded-full", className)} />;
}

export function BigAmountSkeleton({ size = "lg" }: { size?: "lg" | "md" }) {
  return (
    <div className="flex items-baseline gap-1 leading-none">
      <span className={cn("font-bold tracking-[-0.03em]", size === "lg" ? "text-[26px]" : "text-2xl")}>
        <SkeletonText w="1.3em" />
      </span>
      <span className={cn("font-extrabold num tracking-tighter", size === "lg" ? "text-[54px]" : "text-5xl")}>
        <SkeletonText w="3.6em" />
      </span>
    </div>
  );
}

export function DatedRowSkeleton({ title = "11ch", sub = "16ch" }: { title?: string; sub?: string }) {
  return (
    <li className="border-b border-line last:border-0">
      <div className="flex items-center gap-3.5 py-3">
        <DateBlockSkeleton />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">
            <SkeletonText w={title} />
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            <SkeletonText w={sub} />
          </span>
        </div>
        <span className="text-[15px] font-bold num whitespace-nowrap">
          <SkeletonText w="6ch" />
        </span>
      </div>
    </li>
  );
}

export function ActivitySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ol className="flex flex-col" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex gap-3 border-b border-line py-2.5 last:border-0">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/15" />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm">
              <SkeletonText w={i % 2 ? "22ch" : "28ch"} />
            </span>
            <span className="text-xs text-muted-foreground">
              <SkeletonText w="10ch" />
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function StatusPillSkeleton() {
  return <Skeleton className="h-6 w-12 rounded-sm" />;
}

export function TabCountSkeleton() {
  return (
    <span className="ml-1 font-medium text-muted-foreground">
      <SkeletonText w="1ch" />
    </span>
  );
}

export function UnderlineTabsSkeleton({
  labels,
  active = 0,
  className,
}: {
  labels: React.ReactNode[];
  active?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-5 border-b border-line px-5", className)} aria-hidden>
      {labels.map((l, i) => (
        <span
          key={i}
          className={cn(
            "-mb-px shrink-0 border-b-2 pb-2.5 text-sm whitespace-nowrap",
            i === active ? "border-foreground font-bold" : "border-transparent font-medium text-muted-foreground",
          )}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

export const BLANK = "⁣";

export function WithBlank({ text, w }: { text: string; w: string }) {
  const [before, after = ""] = text.split(BLANK);
  return (
    <span>
      {before}
      <SkeletonText w={w} />
      {after}
    </span>
  );
}
