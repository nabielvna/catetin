import "server-only";

import { csvCell } from "@/lib/csv";
import type { Actor } from "@/services/context";
import { getPerson } from "@/services/people/queries";
export async function exportPersonCsv(actor: Actor, partyId: string) {
  const data = await getPerson(actor, partyId);
  if (!data) return null;
  const header = ["date", "type", "title", "direction", "amount", "remaining", "currency", "status", "group"];
  const rows = [...data.entries]
    .reverse()
    .map((e) =>
      [
        e.date,
        e.kind === "OBLIGATION" ? "debt" : (e.settlementKind ?? "payment").toLowerCase(),
        e.title,
        e.direction,
        e.amount,
        e.remaining,
        e.currency,
        e.settled ? "SETTLED" : e.status,
        e.groupName ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  const name = data.header.name.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase();

  return { name, csv: [header.join(","), ...rows].join("\r\n") };
}
