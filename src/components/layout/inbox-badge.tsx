export function InboxBadge({ awaiting, unread }: { awaiting: number; unread: number }) {
  if (awaiting > 0) {
    return (
      <span className="absolute top-1.5 left-1/2 ml-1.25 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-neg px-1.25 text-[11px] font-bold num text-white">
        {awaiting > 99 ? "99+" : awaiting}
      </span>
    );
  }
  if (unread > 0) {
    return (
      <span
        className="absolute top-2.5 left-1/2 ml-1.75 box-content size-2 rounded-full border-2 border-background bg-neg"
        aria-hidden
      />
    );
  }
  return null;
}
