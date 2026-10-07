"use client";
/** Trimmed clip exporter: canvas + MediaRecorder, no deps. */
import { parseCaptions, cuesAreRelative, cueAt } from "./clip-vtt";
import { resolveCaptionStyle, drawCaptions } from "./clip-captions";
export type ExportMode = "vertical" | "original";
export type ClipMeta = { id: string; rank: number; title: string; startSeconds: number; endSeconds: number; captionsVtt: string | null; captionsSrt?: string | null; captionStyleJson: string | null };
function pickMime(): { mime: string; ext: "mp4" | "webm" } {
  const c = [
    { mime: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"', ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ] as const;
  for (const x of c) { try { if (MediaRecorder.isTypeSupported(x.mime)) return { mime: x.mime, ext: x.ext }; } catch {} }
  return { mime: "", ext: "webm" };
}
function waitEv(el: HTMLVideoElement, ev: string, ms = 20000) {
  return new Promise<void>((res, rej) => {
    const to = setTimeout(() => { done(); rej(new Error(`Timed out: ${ev}`)); }, ms);
    const ok = () => { done(); res(); };
    const bad = () => { done(); rej(new Error(`Video load failed (${ev})`)); };
    const done = () => { clearTimeout(to); el.removeEventListener(ev, ok); el.removeEventListener("error", bad); };
    el.addEventListener(ev, ok, { once: true });
    el.addEventListener("error", bad, { once: true });
  });
}
export function clipProxyUrl(projectId: string, shortId: string) {
  return `/api/video-proxy?projectId=${encodeURIComponent(projectId)}&shortId=${encodeURIComponent(shortId)}`;
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function proxyDownloadUrl(projectId: string) {
  return `/api/video-proxy?projectId=${encodeURIComponent(projectId)}`;
}
export async function exportClip(proxyUrl: string, short: ClipMeta, mode: ExportMode, onP?: (f: number) => void): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const start = Math.max(0, short.startSeconds);
  const end = Math.max(start + 0.5, short.endSeconds);
  const dur = end - start;
  const style = resolveCaptionStyle(short.captionStyleJson);
  const cues = parseCaptions(short.captionsVtt, short.captionsSrt);
  const rel = cuesAreRelative(cues, start, end);
  // Both modes burn captions in — "original" used to skip this, so those
  // files downloaded as plain video (the reported "no captions" bug).
  const burn = cues.length > 0;
  const video = document.createElement("video");
  video.crossOrigin = "anonymous"; video.preload = "auto"; video.playsInline = true;
  video.src = proxyUrl;
  await waitEv(video, "loadedmetadata");
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const W = mode === "vertical" ? 1080 : Math.min(vw, 1920);
  const H = mode === "vertical" ? 1920 : Math.round((W * vh) / vw);
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  try {
    const p = waitEv(video, "seeked", 15000);
    video.currentTime = Math.min(Math.max(0, start + 0.05), (video.duration || start + 1) - 0.1);
    await p;
  } catch {}
  try { video.pause(); } catch {}
  const stream = canvas.captureStream(30);
  let actx: AudioContext | null = null;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      actx = new AC();
      if (actx.state === "suspended") await actx.resume().catch(() => {});
      const src = actx.createMediaElementSource(video);
      const dest = actx.createMediaStreamDestination();
      src.connect(dest); src.connect(actx.destination);
      for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    }
  } catch {}
  const picked = pickMime();
  let rec: MediaRecorder;
  try { rec = picked.mime ? new MediaRecorder(stream, { mimeType: picked.mime, videoBitsPerSecond: 8000000 }) : new MediaRecorder(stream); }
  catch { rec = new MediaRecorder(stream); }
  const chunks: BlobPart[] = [];
  const doneP = new Promise<void>((res, rej) => {
    rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => res();
    rec.onerror = () => rej(new Error("Recorder error — try Chrome/Edge desktop"));
  });
  rec.start(500);
  let stopped = false;
  let raf = 0;
  const frame = () => {
    if (stopped) return;
    const t = Math.max(0, video.currentTime - start);
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    if (mode === "vertical") {
      const s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
      ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else ctx.drawImage(video, 0, 0, W, H);
    if (burn) {
      const cue = cueAt(cues, t, rel, start);
      if (cue) drawCaptions(ctx, W, H, cue, t + (rel ? 0 : start), style);
    }
    onP?.(Math.min(0.99, Math.max(0, t / dur)));
    raf = requestAnimationFrame(frame);
  };
  const untilEnd = new Promise<void>((res) => {
    const onT = () => { if (video.currentTime >= end - 0.05) { video.removeEventListener("timeupdate", onT); res(); } };
    video.addEventListener("timeupdate", onT);
    video.addEventListener("ended", () => res(), { once: true });
    setTimeout(() => res(), (dur + 10) * 1000);
  });
  await video.play().catch((e) => { throw new Error(`Could not play source: ${(e as Error)?.message ?? e}`); });
  frame();
  await untilEnd;
  stopped = true;
  cancelAnimationFrame(raf);
  try { video.pause(); } catch {}
  await new Promise((r) => setTimeout(r, 400));
  if (rec.state !== "inactive") rec.stop();
  await doneP;
  try { await actx?.close().catch(() => {}); } catch {}
  video.removeAttribute("src");
  try { video.load(); } catch {}
  onP?.(1);
  return { blob: new Blob(chunks, { type: rec.mimeType || (picked.ext === "mp4" ? "video/mp4" : "video/webm") }), ext: picked.ext };
}

