const MAX_SIDE = 2000;
const QUALITY = 0.88;

const KEEP_BELOW = 1_000_000;

export async function compressImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= KEEP_BELOW) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
