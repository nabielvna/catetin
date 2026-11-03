export async function downloadOrShare(href: string, fallbackName: string, title?: string): Promise<boolean> {
  const res = await fetch(href, { credentials: "same-origin" });
  if (!res.ok) return false;
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const file = new File([blob], name, { type: blob.type });
  const mobile = typeof navigator !== "undefined" && /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return true;
    } catch (e) {
      if ((e as Error).name === "AbortError") return true;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
