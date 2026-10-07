"use client";
/** Canvas caption renderer (1080-wide authored styles). */
import { parseCaptionStyle, type CaptionStyle } from "./caption-styles";
import type { Cue } from "./clip-vtt";
export type { CaptionStyle };
export function resolveCaptionStyle(raw: string | null | undefined): CaptionStyle {
  return parseCaptionStyle(raw ?? null);
}
function hexToRgba(hex: string, pct: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return `rgba(0,0,0,${pct / 100})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${(pct / 100).toFixed(2)})`;
}
function tx(text: string, style: CaptionStyle) {
  if (style.textTransform === "uppercase" || style.uppercase) return text.toUpperCase();
  if (style.textTransform === "lowercase") return text.toLowerCase();
  return text;
}
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}
export function drawCaptions(ctx: CanvasRenderingContext2D, W: number, H: number, cue: Cue | null, absNow: number, style: CaptionStyle) {
  if (!cue) return;
  const words = tx(cue.text, style).split(/\s+/).filter(Boolean);
  const span = Math.max(0.01, cue.end - cue.start);
  const frac = Math.min(0.999, Math.max(0, (absNow - cue.start) / span));
  const active = words.length > 1 ? Math.min(words.length - 1, Math.floor(frac * words.length)) : 0;
  // Scale authored 1080x1920 styles to any canvas: vertical keeps 1:1,
  // landscape "original" exports shrink to fit height so text isn't gigantic.
  const scale = Math.min(W / 1080, H / 1920) || 1;
  const fs = Math.max(10, style.fontSize * scale);
  ctx.save();
  ctx.font = `${style.italic ? "italic " : ""}${style.fontWeight} ${fs}px ${style.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lineH = fs * 1.25;
  const maxW = W * 0.86;
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(trial).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = trial;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 3);
  const blockH = shown.length * lineH + style.paddingY * 2 * scale;
  let yTop: number;
  if (style.position === "top") yTop = (260 - style.offsetY) * (H / 1920);
  else if (style.position === "middle") yTop = H / 2 + style.offsetY * scale - blockH / 2;
  else yTop = H - (260 + style.offsetY) * (H / 1920) - blockH;
  if (style.backgroundOpacity > 0) {
    ctx.fillStyle = hexToRgba(style.backgroundColor, style.backgroundOpacity);
    const bw = Math.min(maxW + style.paddingX * 2 * scale, W * 0.94);
    rr(ctx, (W - bw) / 2, yTop, bw, blockH, style.borderRadius * scale);
    ctx.fill();
  }
  if (style.shadow) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 12 * scale; ctx.shadowOffsetY = 3 * scale; }
  const hl = style.animation === "karaoke" || style.animation === "pop";
  let wi = 0;
  shown.forEach((line, li) => {
    const y = yTop + style.paddingY * scale + lineH * (li + 0.5);
    if (!hl) {
      if (style.strokeWidth > 0) { ctx.lineWidth = style.strokeWidth * scale; ctx.strokeStyle = style.strokeColor; ctx.strokeText(line, W / 2, y); }
      ctx.fillStyle = style.color;
      ctx.fillText(line, W / 2, y);
    } else {
      const parts = line.split(" ");
      const ws = parts.map((p) => ctx.measureText(p).width);
      const gap = ctx.measureText(" ").width;
      const total = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
      let x = W / 2 - total / 2;
      parts.forEach((p, pi) => {
        ctx.textAlign = "left";
        if (style.strokeWidth > 0) { ctx.lineWidth = style.strokeWidth * scale; ctx.strokeStyle = style.strokeColor; ctx.strokeText(p, x, y); }
        ctx.fillStyle = wi === active ? style.highlightColor : style.color;
        ctx.fillText(p, x, y);
        x += ws[pi] + gap;
        wi++;
      });
      ctx.textAlign = "center";
    }
  });
  ctx.restore();
}
