"use server";

import { z } from "zod";

import { action } from "@/actions/action";
import { stopRecurring } from "@/services/debts/recurring";

export const stopRepeat = action(z.object({ id: z.uuid() }), (input, ctx) => stopRecurring(ctx, input));
