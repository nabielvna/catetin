"use client";

import { Camera, Image as ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function PhotoPicker({
  accept = "image/*",
  onFile,
  align = "start",
  children,
}: {
  accept?: string;
  onFile: (file: File) => void;
  align?: "start" | "end";

  children: ReactNode;
}) {
  const t = useTranslations("common");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const input = (ref: React.RefObject<HTMLInputElement | null>, capture?: "environment") => (
    <input
      ref={ref}
      type="file"
      accept={accept}
      capture={capture}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) onFile(f);
      }}
    />
  );

  return (
    <>
      <DropdownMenu
        open={open}
        onOpenChange={(o) => {
          if (o && !window.matchMedia("(pointer: coarse)").matches) return gallery.current?.click();
          setOpen(o);
        }}
      >
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align={align} side="top" className="min-w-52">
          <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => camera.current?.click()}>
            <Camera className="size-5" /> {t("takePhoto")}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-3 px-3 text-sm" onSelect={() => gallery.current?.click()}>
            <ImageIcon className="size-5" /> {t("choosePhoto")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {input(camera, "environment")}
      {input(gallery)}
    </>
  );
}
