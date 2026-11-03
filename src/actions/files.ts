"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { attachFile, removeAttachment } from "@/services/files";

const uuid = z.uuid();

export const attach = action(
  z.object({ fileId: uuid, target: z.object({ type: z.enum(["OBLIGATION", "SETTLEMENT", "BILL"]), id: uuid }) }),
  (input, ctx) => attachFile(ctx, input),
);

export const detach = action(z.object({ attachmentId: uuid }), (input, ctx) => removeAttachment(ctx, input));
