import type { CSSProperties } from "react";
import type { CaptionStyle } from "./caption-styles";

function hexToRgba(hex: string, opacityPct: number) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(num)) return `rgba(0,0,0,${opacityPct / 100})`;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${(opacityPct / 100).toFixed(2)})`;
}

/** Wrapper positioning for the 1080x1920 Remotion composition. */
export function captionBoxCss(style: CaptionStyle): CSSProperties {
  if (style.position === "middle") {
    return {
      position: "absolute",
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      paddingLeft: 32,
      paddingRight: 32,
      top: `calc(50% + ${style.offsetY}px)`,
      transform: "translateY(-50%)",
    };
  }
  return {
    position: "absolute",
    left: 0,
    right: 0,
    display: "flex",
    justifyContent: "center",
    paddingLeft: 32,
    paddingRight: 32,
    ...(style.position === "top"
      ? { top: 260 - style.offsetY }
      : { bottom: 260 + style.offsetY }),
  };
}

/** Text box styling inside Remotion. */
export function captionTextCss(style: CaptionStyle): CSSProperties {
  return {
    maxWidth: "92%",
    borderRadius: style.borderRadius,
    backgroundColor: hexToRgba(style.backgroundColor, style.backgroundOpacity),
    padding: `${style.paddingY}px ${style.paddingX}px`,
    color: style.color,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? "italic" : "normal",
    textTransform: style.textTransform,
    lineHeight: 1.15,
    letterSpacing: "0.02em",
    textAlign: "center",
    ...(style.strokeWidth > 0
      ? {
          WebkitTextStroke: `${style.strokeWidth}px ${style.strokeColor}`,
          paintOrder: "stroke fill",
        }
      : {}),
    ...(style.shadow
      ? { textShadow: "0 4px 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.6)" }
      : {}),
  };
}
