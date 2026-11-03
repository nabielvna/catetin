import "server-only";

import { revalidateTag, updateTag } from "next/cache";

export const userTag = (userId: string) => `user:${userId}`;

export function invalidateUsers(userIds: Iterable<string>) {
  for (const id of new Set(userIds)) {
    const tag = userTag(id);
    try {
      updateTag(tag);
    } catch {
      try {
        revalidateTag(tag, { expire: 0 });
      } catch {}
    }
  }
}
