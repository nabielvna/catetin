import { detectQuad, enhance, fullQuad, type Quad, warp } from "@/components/scan/document";

export type ScanPhoto = { id: string; blob: Blob; url: string };

export const SCAN_SIDE = 2000;
export const CHAT_SIDE = 1600;

export function releasePhotos(photos: readonly ScanPhoto[]) {
  for (const p of photos) URL.revokeObjectURL(p.url);
}

export function photoToDataUrl(photo: ScanPhoto): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(photo.blob);
  });
}

export type Original = { blob: Blob; url: string; width: number; height: number };
export type Filter = "doc" | "orig";

export type Shot = { id: string; original: Original; quad: Quad; filter: Filter; photo: ScanPhoto };

const ORIGINAL_SIDE = 2600;

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob"))), "image/jpeg", quality),
  );
}

export async function originalFrom(source: Blob | HTMLVideoElement, portrait = false): Promise<Original> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : null;
  const src: CanvasImageSource = bitmap ?? (source as HTMLVideoElement);
  const w = bitmap ? bitmap.width : (source as HTMLVideoElement).videoWidth;
  const h = bitmap ? bitmap.height : (source as HTMLVideoElement).videoHeight;
  try {
    const rotate = portrait && w > h;
    const scale = Math.min(1, ORIGINAL_SIDE / Math.max(w, h));
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    const canvas = document.createElement("canvas");
    canvas.width = rotate ? dh : dw;
    canvas.height = rotate ? dw : dh;
    const ctx = canvas.getContext("2d")!;
    if (rotate) {
      ctx.translate(dh, 0);
      ctx.rotate(Math.PI / 2);
    }
    ctx.drawImage(src, 0, 0, dw, dh);
    const blob = await encode(canvas, 0.92);
    return { blob, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
  } finally {
    bitmap?.close();
  }
}

export async function autoQuad(o: Original): Promise<{ quad: Quad; detected: boolean }> {
  const bitmap = await createImageBitmap(o.blob);
  try {
    const q = detectQuad(bitmap, o.width, o.height);
    return q ? { quad: q, detected: true } : { quad: fullQuad(o.width, o.height, 0.04), detected: false };
  } finally {
    bitmap.close();
  }
}

export async function renderShot(o: Original, quad: Quad, filter: Filter, maxSide: number): Promise<ScanPhoto> {
  const bitmap = await createImageBitmap(o.blob);
  try {
    let canvas = warp(bitmap, o.width, o.height, quad, maxSide);
    if (filter === "doc") canvas = enhance(canvas);
    const blob = await encode(canvas, 0.88);
    return { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) };
  } finally {
    bitmap.close();
  }
}

export function releaseShots(shots: readonly Shot[]) {
  for (const s of shots) {
    URL.revokeObjectURL(s.original.url);
    URL.revokeObjectURL(s.photo.url);
  }
}
