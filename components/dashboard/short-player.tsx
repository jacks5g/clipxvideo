"use client";

import { AbsoluteFill, Video, useCurrentFrame, useVideoConfig } from "remotion";
import { Player } from "@remotion/player";
import { useEffect, useMemo, useState } from "react";
import { Play, PlayCircle, X } from "lucide-react";
import {
  DEFAULT_CAPTION_STYLE,
  type CaptionStyle,
} from "@/lib/caption-styles";
import { captionBoxCss, captionTextCss } from "@/lib/caption-css";
import {
  cuesAreRelative as cuesAreRelativeToShort,
  parseCaptions,
  type Cue,
} from "@/lib/clip-vtt";

/** Formats seconds as m:ss for poster/badge labels. */
function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Caption parsing + relative-track heuristic live in lib/clip-vtt so the
// Remotion preview and the canvas exporter stay in sync.

const Subtitles = ({
  cues,
  startSeconds,
  endSeconds,
  captionStyle,
}: {
  cues: Cue[];
  startSeconds: number;
  endSeconds: number;
  captionStyle: CaptionStyle;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const relative = useMemo(
    () => cuesAreRelativeToShort(cues, startSeconds, endSeconds),
    [cues, startSeconds, endSeconds],
  );

  // Position 0 of the composition == `startSeconds` of the source video, so
  // absolute-time cues need the offset added to stay locked to the voice.
  const currentTime = frame / fps + (relative ? 0 : startSeconds);

  const currentCue = cues.find((c) => currentTime >= c.start && currentTime <= c.end);

  if (!currentCue) return null;

  const words = currentCue.text.split(/\s+/).filter(Boolean);
  const activeIdx =
    words.length > 1
      ? Math.min(
          words.length - 1,
          Math.floor(
            ((currentTime - currentCue.start) /
              Math.max(0.01, currentCue.end - currentCue.start)) *
              words.length,
          ),
        )
      : 0;

  return (
    <div style={captionBoxCss(captionStyle)}>
      <p style={captionTextCss(captionStyle)}>
        {captionStyle.animation === "karaoke" || captionStyle.animation === "pop"
          ? words.map((w, i) => (
              <span
                key={i}
                style={
                  i === activeIdx
                    ? { color: captionStyle.highlightColor }
                    : undefined
                }
              >
                {w}
                {i < words.length - 1 ? " " : ""}
              </span>
            ))
          : currentCue.text}
      </p>
    </div>
  );
};

export const ShortVideoComposition = ({ src, startSeconds, endSeconds, captionsVtt, captionsSrt, captionStyleJson }: { src: string; startSeconds: number; endSeconds: number; captionsVtt: string | null; captionsSrt?: string | null; captionStyleJson?: string | null; }) => {
  const { fps } = useVideoConfig();

  const startFrame = Math.round(startSeconds * fps);
  const durationInFrames = Math.max(
    1,
    Math.round(Math.max(0.1, endSeconds - startSeconds) * fps),
  );

  const cues = useMemo(() => parseCaptions(captionsVtt, captionsSrt), [captionsVtt, captionsSrt]);
  const captionStyle: CaptionStyle = useMemo(() => {
    if (!captionStyleJson) return DEFAULT_CAPTION_STYLE;
    try {
      return { ...DEFAULT_CAPTION_STYLE, ...JSON.parse(captionStyleJson) };
    } catch {
      return DEFAULT_CAPTION_STYLE;
    }
  }, [captionStyleJson]);

  return (
    <AbsoluteFill className="bg-black">
      {/* Single <Video> only — a duplicated blurred layer would pull the same
          bytes from Storj twice for one preview. trimBefore/trimAfter lock
          playback to the short's [startSeconds, endSeconds] window so the
          full source URL never plays beyond the clip.
          objectFit="cover" fills the full 1080x1920 frame (no letterboxing)
          so 16:9 landscape sources are center-cropped like TikTok/Shorts. */}
      <Video
        src={src}
        trimBefore={startFrame}
        trimAfter={startFrame + durationInFrames}
        className="h-full w-full object-cover"
        style={{ objectFit: "cover", width: "100%", height: "100%" }}
      />
      {cues.length > 0 && <Subtitles cues={cues} startSeconds={startSeconds} endSeconds={endSeconds} captionStyle={captionStyle} />}
    </AbsoluteFill>
  );
};

type ShortPlayerProps = {
  /** Full source video URL (Storj playback URL). */
  src: string | null;
  /** Short clip metadata — seconds into the source video. */
  startSeconds: number;
  endSeconds: number;
  captionsVtt: string | null;
  captionsSrt?: string | null;
  /** Stored CaptionStyle JSON (shorts.caption_style_json) — live preview. */
  captionStyleJson?: string | null;
  title?: string;
  /** Optional poster image (e.g. YouTube thumbnail) — never fetched from Storj. */
  thumbnailUrl?: string | null;
  /** When true the Remotion <Player> mounts immediately (used in edit dialog). */
  autoLoad?: boolean;
};

export function ShortPlayer({ 
  src, 
  startSeconds, 
  endSeconds, 
  captionsVtt,
  captionsSrt,
  captionStyleJson,
  title,
  thumbnailUrl,
  autoLoad = false,
}: ShortPlayerProps) {
  const [previewLoaded, setPreviewLoaded] = useState(autoLoad);

  // Switching clips resets to the gated poster so the newly selected
  // short never silently streams Storj bytes in the background.
  useEffect(() => {
    setPreviewLoaded(autoLoad);
  }, [src, startSeconds, endSeconds, autoLoad]);
  const fps = 30;
  const durationInSeconds = Math.max(0.1, endSeconds - startSeconds);
  const durationInFrames = Math.max(1, Math.round(durationInSeconds * fps));

  if (!src) {
    return (
      <div className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-xl bg-muted/30 px-4 text-center ring-1 ring-foreground/10">
        <PlayCircle className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Preview unavailable</p>
        <p className="text-xs text-muted-foreground">
          The source video is not in storage anymore.
        </p>
      </div>
    );
  }

  // Poster state — nothing from Storj is requested until the user opts in.
  if (!previewLoaded) {
    return (
      <button
        type="button"
        onClick={() => setPreviewLoaded(true)}
        className="group relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-black text-left ring-1 ring-foreground/10 transition-all hover:ring-brand/40"
      >
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand/30 via-brand/5 to-black" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/20" />

        <div className="absolute inset-x-0 top-0 p-3">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-white/80 uppercase">
            Thumbnail · not loaded
          </span>
        </div>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/20 transition-transform group-hover:scale-105">
            <Play className="size-6" fill="currentColor" aria-hidden />
          </span>
          <span className="text-sm font-semibold text-white">Load preview</span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          {title ? (
            <p className="line-clamp-2 text-xs font-medium text-white">{title}</p>
          ) : null}
          <p className="text-[11px] text-white/60">
            {formatClock(startSeconds)} → {formatClock(endSeconds)} · {durationInSeconds.toFixed(1)}s
          </p>
          <p className="text-[11px] text-white/40">
            Loads on click — no Storj bandwidth is used until then.
          </p>
        </div>
      </button>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-full overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10">
      {/* 9:16 composition (1080x1920) + width:100% lets the Player scale the
          video proportionally — zero letterboxing, zero distortion. Height
          stays auto so the control bar renders below the video instead of
          being clipped by a fixed aspect box. */}
      <Player
        key={`${src}-${startSeconds}-${endSeconds}-${captionStyleJson ?? "default"}-${(captionsVtt ?? "").length}-${(captionsSrt ?? "").length}`}
        component={ShortVideoComposition}
        inputProps={{
          src,
          startSeconds,
          endSeconds,
          captionsVtt,
          captionsSrt: captionsSrt ?? null,
          captionStyleJson: captionStyleJson ?? null,
        }}
        durationInFrames={durationInFrames}
        compositionWidth={1080}
        compositionHeight={1920}
        fps={fps}
        style={{
          width: "100%",
        }}
        controls
        autoPlay={false}
        loop
        clickToPlay
        acknowledgeRemotionLicense
        showPosterWhenUnplayed
        showPosterWhenPaused={false}
        showPosterWhenEnded
        renderPoster={() =>
          thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/30 via-brand/5 to-black">
              <Play className="size-10 text-white/70" fill="currentColor" aria-hidden />
            </div>
          )
        }
      />
      <button
        type="button"
        onClick={() => setPreviewLoaded(false)}
        aria-label="Close preview"
        className="absolute top-2 right-2 z-10 rounded-md bg-black/60 p-1.5 text-white/70 transition-colors hover:text-white"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
