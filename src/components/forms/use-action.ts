"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/actions/action";

export const SAVED_EVENT = "catetin:saved";

export function useAction() {
  const [pending, start] = useTransition();
  const te = useTranslations("errors");

  function run<T>(
    fn: () => Promise<ActionResult<T>>,
    opts: { success?: string | ((data: T) => string | undefined); onSuccess?: (data: T) => void } = {},
  ) {
    start(async () => {
      let res: ActionResult<T>;
      try {
        res = await fn();
      } catch {
        toast.error(te("NETWORK"));
        return;
      }
      if (!res.ok) {
        toast.error(te(res.code));
        return;
      }
      window.dispatchEvent(new Event(SAVED_EVENT));
      const msg = typeof opts.success === "function" ? opts.success(res.data) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(res.data);
    });
  }
  return { pending, run };
}
