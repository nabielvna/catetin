import { type Original, originalFrom } from "@/components/scan/photo";

type Caps = MediaTrackCapabilities & { torch?: boolean; focusMode?: string[] };
type ImageCaptureLike = { takePhoto(): Promise<Blob> };
type ImageCaptureCtor = new (track: MediaStreamTrack) => ImageCaptureLike;

const VIDEO = { width: { ideal: 1920 }, height: { ideal: 1080 } };

export type Camera = {
  stream: MediaStream;
  track: MediaStreamTrack;
  torch: boolean;

  tapFocus: boolean;
};

async function open(constraints: MediaTrackConstraints): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: { ...VIDEO, ...constraints } });
}

const IOS_MULTI = /back (triple|dual wide) camera/i;

const BACK = /facing back|back|rear|environment/i;

const CACHE_KEY = "catetin:scan-camera";

const stop = (s: MediaStream) => s.getTracks().forEach((t) => t.stop());
const capsOf = (s: MediaStream) => (s.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as Caps;
const hasAutofocus = (s: MediaStream) =>
  Boolean(capsOf(s).focusMode?.some((m) => m === "continuous" || m === "single-shot"));
const deviceOf = (s: MediaStream) => s.getVideoTracks()[0]?.getSettings().deviceId;

const lensIndex = (label: string) => Number(/camera2? (\d+)/i.exec(label)?.[1] ?? 99);

function cached(): string | null {
  try {
    return localStorage.getItem(CACHE_KEY);
  } catch {
    return null;
  }
}
function remember(id: string | undefined) {
  try {
    if (id) localStorage.setItem(CACHE_KEY, id);
  } catch {}
}

async function pickAutofocusCamera(stream: MediaStream): Promise<MediaStream> {
  if (hasAutofocus(stream)) return stream;
  const first = deviceOf(stream);
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const candidates = devices
    .filter((d) => d.kind === "videoinput" && d.deviceId && d.deviceId !== first && BACK.test(d.label))
    .sort((a, b) => lensIndex(a.label) - lensIndex(b.label));
  if (candidates.length === 0) return stream;
  stop(stream);
  for (const d of candidates) {
    const s = await open({ deviceId: { exact: d.deviceId } }).catch(() => null);
    if (!s) continue;
    if (hasAutofocus(s)) return s;
    stop(s);
  }

  return open(first ? { deviceId: { exact: first } } : { facingMode: { ideal: "environment" } });
}

export async function openBackCamera(): Promise<Camera> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
  const saved = cached();
  let stream =
    (saved ? await open({ deviceId: { exact: saved } }).catch(() => null) : null) ??
    (await open({ facingMode: { ideal: "environment" } }));
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const multi = devices.find((d) => d.kind === "videoinput" && IOS_MULTI.test(d.label));
    if (multi && multi.deviceId !== deviceOf(stream)) {
      stop(stream);
      stream = await open({ deviceId: { exact: multi.deviceId } });
    } else if (!multi) {
      stream = await pickAutofocusCamera(stream);
    }
  } catch {
    if (!stream.active) stream = await open({ facingMode: { ideal: "environment" } });
  }
  const track = stream.getVideoTracks()[0]!;
  const caps = capsOf(stream);
  if (hasAutofocus(stream)) remember(deviceOf(stream));
  if (caps.focusMode?.includes("continuous")) {
    await track
      .applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
      .catch(() => {});
  }
  return {
    stream,
    track,
    torch: Boolean(caps.torch),
    tapFocus: Boolean(caps.focusMode?.some((m) => m === "single-shot" || m === "continuous")),
  };
}

let refocus: ReturnType<typeof setTimeout> | undefined;

export async function focusAt(track: MediaStreamTrack, x: number, y: number) {
  const caps = (track.getCapabilities?.() ?? {}) as Caps;
  const single = caps.focusMode?.includes("single-shot");
  await track
    .applyConstraints({
      advanced: [
        { pointsOfInterest: [{ x, y }], focusMode: single ? "single-shot" : "continuous" } as MediaTrackConstraintSet,
      ],
    })
    .catch(() => {});
  clearTimeout(refocus);
  if (single && caps.focusMode?.includes("continuous")) {
    refocus = setTimeout(() => {
      if (track.readyState === "live")
        void track
          .applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
          .catch(() => {});
    }, 4000);
  }
}

export function pointInVideo(video: HTMLVideoElement, clientX: number, clientY: number) {
  const r = video.getBoundingClientRect();
  const s = Math.max(r.width / video.videoWidth, r.height / video.videoHeight);
  const w = video.videoWidth * s;
  const h = video.videoHeight * s;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp((clientX - r.left - (r.width - w) / 2) / w), y: clamp((clientY - r.top - (r.height - h) / 2) / h) };
}

export async function capture(track: MediaStreamTrack, video: HTMLVideoElement): Promise<Original> {
  const IC = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
  if (IC && track.readyState === "live") {
    try {
      const blob = await Promise.race([
        new IC(track).takePhoto(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000)),
      ]);

      return await originalFrom(blob, video.videoHeight > video.videoWidth);
    } catch {}
  }
  return originalFrom(video);
}
