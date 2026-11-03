import "server-only";

import { createHash } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import sharp, { type OutputInfo } from "sharp";

import { db } from "@/database/client";
import { bill } from "@/database/schema/bills";
import { obligation } from "@/database/schema/debts";
import { attachment, file } from "@/database/schema/files";
import { settlement } from "@/database/schema/payments";
import { DomainError } from "@/domain/errors";
import { storage } from "@/integrations/storage/index";
import { newId } from "@/lib/server/ids";
import { recordActivity } from "@/services/activity";
import type { Actor, Ctx } from "@/services/context";
import { refreshScope } from "@/services/notifications/parties";
import { mutate } from "@/services/transaction";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP")
    return "image/webp";
  if (
    buf.subarray(4, 12).toString("ascii").startsWith("ftyphei") ||
    buf.subarray(4, 12).toString("ascii").startsWith("ftypmif")
  )
    return "image/heic";
  return null;
}

export async function uploadImage(actor: Actor, input: Buffer): Promise<{ id: string }> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new DomainError("FILE_REJECTED");
  const mime = sniff(input);
  if (!mime) throw new DomainError("FILE_REJECTED");
  let out: { data: Buffer; info: OutputInfo };
  try {
    out = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new DomainError("FILE_REJECTED");
  }
  const id = newId();
  const key = `files/${actor.userId}/${id}.webp`;
  await storage().put(key, out.data, "image/webp");
  await db
    .insert(file)
    .values({
      id,
      ownerUserId: actor.userId,
      storageKey: key,
      mime: "image/webp",
      bytes: out.data.length,
      width: out.info.width,
      height: out.info.height,
      sha256: createHash("sha256").update(out.data).digest("hex"),
    });
  return { id };
}

type Target = { type: "OBLIGATION" | "SETTLEMENT" | "BILL"; id: string };

async function targetInfo(t: Target) {
  if (t.type === "OBLIGATION") {
    const [o] = await db.select().from(obligation).where(eq(obligation.id, t.id));
    if (!o) return null;
    return {
      parties: [o.creditorId, o.debtorId],
      groupId: o.groupId,
      pairId: o.pairId,
      status: o.status,
      createdBy: o.createdBy,
    };
  }
  if (t.type === "SETTLEMENT") {
    const [s] = await db.select().from(settlement).where(eq(settlement.id, t.id));
    if (!s) return null;
    return {
      parties: [s.payerId, s.payeeId],
      groupId: s.groupId,
      pairId: s.pairId,
      status: s.status,
      createdBy: s.createdBy,
    };
  }
  const [b] = await db.select().from(bill).where(eq(bill.id, t.id));
  if (!b) return null;
  const shares = await db.execute<{ party_id: string }>(sql`select party_id from bill_share where bill_id = ${t.id}`);
  return {
    parties: [b.payerPartyId, ...shares.map((s) => s.party_id)],
    groupId: b.groupId,
    pairId: null,
    status: "ACTIVE",
    createdBy: b.createdBy,
  };
}

async function canSee(actor: Actor, info: NonNullable<Awaited<ReturnType<typeof targetInfo>>>) {
  if (info.parties.includes(actor.partyId) || info.createdBy === actor.userId) return true;
  if (!info.groupId) return false;
  const [m] = await db.execute<{ ok: number }>(sql`
    select 1 as ok from group_member where group_id = ${info.groupId} and party_id = ${actor.partyId} and status = 'ACTIVE'`);
  return Boolean(m);
}

export function attachFile(ctx: Ctx, input: { fileId: string; target: Target }) {
  return mutate(async (tx, fx) => {
    const [f] = await tx.select().from(file).where(eq(file.id, input.fileId));
    if (!f || f.ownerUserId !== ctx.actor.userId) throw new DomainError("NOT_FOUND");
    const info = await targetInfo(input.target);
    if (!info || !info.parties.includes(ctx.actor.partyId)) throw new DomainError("NOT_FOUND");
    const id = newId();
    await tx
      .insert(attachment)
      .values({
        id,
        fileId: f.id,
        targetType: input.target.type,
        targetId: input.target.id,
        addedBy: ctx.actor.userId,
      });
    await recordActivity(tx, ctx, {
      type: "EVIDENCE_ADDED",
      pairId: info.pairId,
      groupId: info.groupId,
      targetType: input.target.type,
      targetId: input.target.id,
    });
    await refreshScope(tx, fx, { partyIds: info.parties, groupId: info.groupId, pairId: info.pairId });
    return { id };
  });
}

export function removeAttachment(ctx: Ctx, input: { attachmentId: string }) {
  return mutate(async (tx, fx) => {
    const [a] = await tx
      .select()
      .from(attachment)
      .where(and(eq(attachment.id, input.attachmentId), isNull(attachment.hiddenAt)));
    if (!a || a.addedBy !== ctx.actor.userId) throw new DomainError("NOT_FOUND");
    const info = await targetInfo({ type: a.targetType, id: a.targetId });
    if (!info) throw new DomainError("NOT_FOUND");
    if (info.status === "PENDING") {
      await tx.delete(attachment).where(eq(attachment.id, a.id));
    } else {
      await tx.update(attachment).set({ hiddenAt: ctx.now, hiddenBy: ctx.actor.userId }).where(eq(attachment.id, a.id));
      await recordActivity(tx, ctx, {
        type: "EVIDENCE_HIDDEN",
        pairId: info.pairId,
        groupId: info.groupId,
        targetType: a.targetType,
        targetId: a.targetId,
      });
    }
    await refreshScope(tx, fx, { partyIds: info.parties, groupId: info.groupId, pairId: info.pairId });
  });
}

export async function listAttachments(actor: Actor, target: Target) {
  const info = await targetInfo(target);
  if (!info || !(await canSee(actor, info))) return [];
  const rows = await db
    .select({
      id: attachment.id,
      fileId: attachment.fileId,
      addedBy: attachment.addedBy,
      hiddenAt: attachment.hiddenAt,
      width: file.width,
      height: file.height,
    })
    .from(attachment)
    .innerJoin(file, eq(file.id, attachment.fileId))
    .where(and(eq(attachment.targetType, target.type), eq(attachment.targetId, target.id)))
    .orderBy(attachment.addedAt);
  return rows.map((r) => ({
    id: r.id,
    fileId: r.fileId,
    mine: r.addedBy === actor.userId,
    hidden: r.hiddenAt !== null,
    width: r.width,
    height: r.height,
  }));
}

export async function readFileFor(actor: Actor, fileId: string): Promise<Buffer | null> {
  const [f] = await db.select().from(file).where(eq(file.id, fileId));
  if (!f) return null;
  let allowed = f.ownerUserId === actor.userId;
  if (!allowed) {
    const atts = await db
      .select()
      .from(attachment)
      .where(and(eq(attachment.fileId, fileId), isNull(attachment.hiddenAt)));
    for (const a of atts) {
      const info = await targetInfo({ type: a.targetType, id: a.targetId });
      if (info && (await canSee(actor, info))) {
        allowed = true;
        break;
      }
    }
  }
  if (!allowed) return null;
  return storage().get(f.storageKey);
}
