import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent font-semibold whitespace-nowrap transition-[background-color,opacity,transform] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        "default": "bg-primary font-bold text-primary-foreground hover:bg-primary/85",
        "outline": "border-border bg-transparent text-foreground hover:bg-soft",
        "secondary": "bg-soft text-foreground hover:bg-accent",
        "ghost": "text-foreground hover:bg-soft",
        "destructive": "bg-neg/10 text-neg hover:bg-neg/15",
        "inverse": "bg-inverse-foreground font-bold text-inverse hover:opacity-90",
        "inverse-outline": "border-inverse-line bg-transparent text-inverse-foreground hover:bg-inverse-foreground/10",
        "link": "px-0 text-foreground underline-offset-4 hover:underline",
      },
      size: {
        "default": "h-12 px-4 text-[15px]",
        "sm": "h-10 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        "xs": "h-8 rounded-sm px-2.5 text-[13px] [&_svg:not([class*='size-'])]:size-4",
        "lg": "h-14 px-5 text-base",
        "icon": "size-12",
        "icon-sm": "size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
