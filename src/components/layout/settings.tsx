import { ChevronRight, type LucideIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsGroup({
  title,
  footer,
  children,
  className,
  tour,
}: {
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;

  tour?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2 px-4 pt-6", className)} data-tour={tour}>
      {title ? (
        <h2 className="px-1 text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</h2>
      ) : null}
      <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg bg-soft">{children}</div>
      {footer ? <p className="px-1 text-[13px] leading-relaxed text-muted-foreground">{footer}</p> : null}
    </section>
  );
}

type RowProps = {
  icon?: LucideIcon;
  label: React.ReactNode;
  hint?: React.ReactNode;
  value?: React.ReactNode;

  trailing?: React.ReactNode | false;
  tone?: "default" | "neg";
  href?: string;
  download?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;

  tour?: string;
};

export function SettingsRow({
  icon: Icon,
  label,
  hint,
  value,
  trailing,
  tone = "default",
  href,
  download,
  onClick,
  disabled,
  className,
  tour,
}: RowProps) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {Icon ? (
        <Icon className={cn("size-5 shrink-0", tone === "neg" ? "text-neg" : "text-muted-foreground")} aria-hidden />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-[15px] font-medium", tone === "neg" && "text-neg")}>{label}</span>
        {hint ? <span className="text-[13px] leading-snug text-muted-foreground">{hint}</span> : null}
      </span>
      {value !== undefined ? (
        <span className="max-w-[45%] shrink-0 truncate text-right text-[15px] text-muted-foreground">{value}</span>
      ) : null}
      {trailing === undefined ? (
        interactive ? (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null
      ) : (
        trailing || null
      )}
    </>
  );
  const cls = cn(
    "flex min-h-14 w-full items-center gap-3.5 px-4 py-3 text-left",
    interactive && "transition-colors hover:bg-foreground/4 active:bg-foreground/6",
    disabled && "pointer-events-none opacity-50",
    className,
  );
  if (href && download) {
    return (
      <a href={href} download className={cls} data-tour={tour}>
        {body}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={cls} data-tour={tour}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls} data-tour={tour}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} data-tour={tour}>
      {body}
    </div>
  );
}
