import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

function SkeletonText({ w = "8ch", className }: { w?: string; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="skeleton"
      className={cn(
        "inline-block h-[0.72em] max-w-full animate-pulse rounded-[0.15em] bg-muted align-baseline",
        className,
      )}
      style={{ width: w }}
    />
  );
}

export { Skeleton, SkeletonText };
