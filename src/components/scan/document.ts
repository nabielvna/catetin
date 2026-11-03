export type Pt = { x: number; y: number };

export type Quad = [Pt, Pt, Pt, Pt];

export function fullQuad(w: number, h: number, inset = 0): Quad {
  const dx = w * inset;
  const dy = h * inset;
  return [
    { x: dx, y: dy },
    { x: w - dx, y: dy },
    { x: w - dx, y: h - dy },
    { x: dx, y: h - dy },
  ];
}

function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function quadArea(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += q[i]!.x * q[(i + 1) % 4]!.y - q[(i + 1) % 4]!.x * q[i]!.y;
  return Math.abs(s) / 2;
}
export function isConvex(q: Quad): boolean {
  const signs = q.map((_, i) => Math.sign(cross(q[i]!, q[(i + 1) % 4]!, q[(i + 2) % 4]!)));
  return signs.every((s) => s !== 0 && s === signs[0]);
}

function otsu(hist: Uint32Array, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export function detectQuad(src: CanvasImageSource, w: number, h: number): Quad | null {
  const scale = 256 / Math.max(w, h);
  const sw = Math.max(8, Math.round(w * scale));
  const sh = Math.max(8, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, sw, sh);
  const rgba = ctx.getImageData(0, 0, sw, sh).data;
  const n = sw * sh;

  const gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) gray[i] = (rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000;
  const blur = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let s = 0;
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= sh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= sw) continue;
          s += gray[yy * sw + xx]!;
          c++;
        }
      }
      const v = s / c;
      blur[y * sw + x] = v;
      hist[Math.round(v)]!++;
    }
  }
  const t = otsu(hist, n);

  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let bestSize = 0;
  let bestLabel = -1;
  let next = 0;
  for (let start = 0; start < n; start++) {
    if (label[start] !== -1 || blur[start]! <= t) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = next;
    while (head < tail) {
      const p = queue[head++]!;
      const px = p % sw;
      const neighbors = [px > 0 ? p - 1 : -1, px < sw - 1 ? p + 1 : -1, p - sw, p + sw];
      for (const q of neighbors) {
        if (q < 0 || q >= n || label[q] !== -1 || blur[q]! <= t) continue;
        label[q] = next;
        queue[tail++] = q;
      }
    }
    if (tail > bestSize) {
      bestSize = tail;
      bestLabel = next;
    }
    next++;
  }
  if (bestLabel < 0 || bestSize < n * 0.06 || bestSize > n * 0.94) return null;

  let tl = { v: Infinity, x: 0, y: 0 };
  let br = { v: -Infinity, x: 0, y: 0 };
  let tr = { v: -Infinity, x: 0, y: 0 };
  let bl = { v: Infinity, x: 0, y: 0 };
  for (let p = 0; p < n; p++) {
    if (label[p] !== bestLabel) continue;
    const x = p % sw;
    const y = (p - x) / sw;
    if (x + y < tl.v) tl = { v: x + y, x, y };
    if (x + y > br.v) br = { v: x + y, x, y };
    if (x - y > tr.v) tr = { v: x - y, x, y };
    if (x - y < bl.v) bl = { v: x - y, x, y };
  }
  const q: Quad = [tl, tr, br, bl].map((p) => ({
    x: Math.min(w, Math.max(0, (p.x + 0.5) / scale)),
    y: Math.min(h, Math.max(0, (p.y + 0.5) / scale)),
  })) as Quad;

  if (!isConvex(q) || quadArea(q) < (bestSize / scale / scale) * 0.85) return null;
  return q;
}

function homography(from: Quad, to: Quad): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]!;
    const { x: u, y: v } = to[i]!;
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    const d = A[c]![c]!;
    for (let k = c; k < 9; k++) A[c]![k]! /= d;
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r]![c]!;
      if (f === 0) continue;
      for (let k = c; k < 9; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  return [...A.map((row) => row[8]!), 1];
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export function warp(src: CanvasImageSource, w: number, h: number, q: Quad, maxSide: number): HTMLCanvasElement {
  let ow = Math.max(dist(q[0], q[1]), dist(q[3], q[2]));
  let oh = Math.max(dist(q[0], q[3]), dist(q[1], q[2]));
  const s = Math.min(1, maxSide / Math.max(ow, oh));
  ow = Math.max(1, Math.round(ow * s));
  oh = Math.max(1, Math.round(oh * s));

  const input = document.createElement("canvas");
  input.width = w;
  input.height = h;
  const ictx = input.getContext("2d", { willReadFrequently: true })!;
  ictx.drawImage(src, 0, 0, w, h);
  const sd = ictx.getImageData(0, 0, w, h).data;

  const out = document.createElement("canvas");
  out.width = ow;
  out.height = oh;
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(ow, oh);
  const od = img.data;
  const H = homography(fullQuad(ow, oh), q);
  for (let v = 0; v < oh; v++) {
    for (let u = 0; u < ow; u++) {
      const z = H[6]! * u + H[7]! * v + 1;
      const x = Math.min(w - 1.001, Math.max(0, (H[0]! * u + H[1]! * v + H[2]!) / z));
      const y = Math.min(h - 1.001, Math.max(0, (H[3]! * u + H[4]! * v + H[5]!) / z));
      const x0 = x | 0;
      const y0 = y | 0;
      const fx = x - x0;
      const fy = y - y0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + w * 4;
      const i11 = i01 + 4;
      const o = (v * ow + u) * 4;
      for (let c = 0; c < 3; c++) {
        const top = sd[i00 + c]! + (sd[i10 + c]! - sd[i00 + c]!) * fx;
        const bot = sd[i01 + c]! + (sd[i11 + c]! - sd[i01 + c]!) * fx;
        od[o + c] = top + (bot - top) * fy;
      }
      od[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function enhance(src: HTMLCanvasElement): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const bw = Math.max(4, Math.round(w / 16));
  const bh = Math.max(4, Math.round(h / 16));
  const small = document.createElement("canvas");
  small.width = bw;
  small.height = bh;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(src, 0, 0, bw, bh);
  const sm = sctx.getImageData(0, 0, bw, bh);
  let g = new Float32Array(bw * bh);
  for (let i = 0; i < g.length; i++) g[i] = (sm.data[i * 4]! + sm.data[i * 4 + 1]! + sm.data[i * 4 + 2]!) / 3;
  for (let pass = 0; pass < 2; pass++) {
    const nx = new Float32Array(g.length);
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = Math.min(bw - 1, Math.max(0, x + dx));
            const yy = Math.min(bh - 1, Math.max(0, y + dy));
            m = Math.max(m, g[yy * bw + xx]!);
          }
        nx[y * bw + x] = m;
      }
    g = nx;
  }
  for (let i = 0; i < g.length; i++) {
    const v = Math.max(1, g[i]!);
    sm.data[i * 4] = sm.data[i * 4 + 1] = sm.data[i * 4 + 2] = v;
  }
  sctx.putImageData(sm, 0, 0);
  const bg = document.createElement("canvas");
  bg.width = w;
  bg.height = h;
  const bctx = bg.getContext("2d", { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, w, h);
  const bd = bctx.getImageData(0, 0, w, h).data;

  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000;
    const norm = Math.min(255, (lum / Math.max(24, bd[i]!)) * 255);
    const v = Math.max(0, Math.min(255, 255 - (255 - norm) * 1.5));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.putImageData(img, 0, 0);
  return out;
}
