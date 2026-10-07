/**
 * Single source of truth for caption styling.
 * Every short stores one CaptionStyle JSON blob (shorts.caption_style_json).
 */
export type CaptionPosition = "top" | "middle" | "bottom";
export type CaptionAnimation = "none" | "pop" | "fade" | "karaoke";
export type CaptionTextTransform = "none" | "uppercase" | "lowercase" | "capitalize";

export type CaptionStyle = {
  presetId: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  textTransform: CaptionTextTransform;
  color: string;
  highlightColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  borderRadius: number;
  paddingX: number;
  paddingY: number;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  position: CaptionPosition;
  offsetY: number;
  animation: CaptionAnimation;
  maxWordsPerCue: number;
  uppercase: boolean;
};

export const CAPTION_FONTS = [
  { id: "inter", label: "Inter — clean sans", stack: "Inter, system-ui, sans-serif" },
  { id: "impact", label: "Impact — bold meme", stack: "Impact, 'Arial Black', sans-serif" },
  { id: "bebas", label: "Bebas — tall caps", stack: "'Bebas Neue', 'Arial Narrow', Impact, sans-serif" },
  { id: "serif", label: "Serif — editorial", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", label: "Mono — terminal", stack: "'Geist Mono', ui-monospace, Menlo, monospace" },
  { id: "rounded", label: "Rounded — friendly", stack: "'Trebuchet MS', Verdana, sans-serif" },
];

export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  presetId: "hormozi",
  fontFamily: "Impact, 'Arial Black', sans-serif",
  fontSize: 68,
  fontWeight: 900,
  italic: false,
  textTransform: "uppercase",
  color: "#ffffff",
  highlightColor: "#facc15",
  backgroundColor: "#000000",
  backgroundOpacity: 75,
  borderRadius: 16,
  paddingX: 24,
  paddingY: 12,
  strokeColor: "#000000",
  strokeWidth: 0,
  shadow: true,
  position: "bottom",
  offsetY: 0,
  animation: "pop",
  maxWordsPerCue: 3,
  uppercase: true,
};

export function parseCaptionStyle(raw: string | null | undefined): CaptionStyle {
  if (!raw) return { ...DEFAULT_CAPTION_STYLE };
  try {
    const parsed = JSON.parse(raw) as Partial<CaptionStyle>;
    const merged: CaptionStyle = { ...DEFAULT_CAPTION_STYLE, ...parsed };
    merged.uppercase = merged.textTransform === "uppercase";
    return merged;
  } catch {
    return { ...DEFAULT_CAPTION_STYLE };
  }
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
