"use client";

import Link from "next/link";
import { Calendar, Download, FileText, Pencil, Scissors, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { ShortPlayer } from "@/components/dashboard/short-player";
import { ClipDownloadButtons } from "@/components/dashboard/clip-download-buttons";

/** Shape of a `shorts` row as served by GET /api/projects/:id. */
export type ShortClip = {
  id: string;
  rank: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number | null;
  reason: string | null;
  hook: string | null;
  seoScore: number | null;
  transcriptSnippet: string | null;
  captionsSrt: string | null;
  captionsVtt: string | null;
  captionStyleJson: string | null;
  cueCount: number;
};

function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function clipDuration(s: ShortClip) {
  return s.durationSeconds ?? Math.max(0, s.endSeconds - s.startSeconds);
}

type ShortClipShowcaseProps = {
  projectId: string;
  shorts: ShortClip[];
  activeShort: ShortClip;
  onSelect: (id: string) => void;
  /** Full source video URL (Storj playback URL) — passed straight to the player. */
  playbackUrl: string | null;
  thumbnailUrl?: string | null;
  projectTitle: string | null;
  analyzing: boolean;
  onRerun: () => void;
  onDownload: (short: ShortClip, kind: "srt" | "vtt") => void;
  onDownloadInfo: (short: ShortClip) => void;
  onEdit: (short: ShortClip) => void;
};

/**
 * Featured short clip panel — shown as soon as analysis produces shorts.
 * Replaces the progress panel entirely (per product requirement #6).
 */
export function ShortClipShowcase({
  projectId,
  shorts,
  activeShort,
  onSelect,
  playbackUrl,
  thumbnailUrl,
  projectTitle,
  analyzing,
  onRerun,
  onDownload,
  onDownloadInfo,
  onEdit,
}: ShortClipShowcaseProps) {
  const duration = clipDuration(activeShort);
  const scheduleHref =
    `/dashboard/schedule-post?projectId=${encodeURIComponent(projectId)}` +
    `&shortId=${encodeURIComponent(activeShort.id)}` +
    `&title=${encodeURIComponent(activeShort.title)}`;

  const stats = [
    { label: "SEO score", value: `${activeShort.seoScore ?? "–"}/100` },
    { label: "Duration", value: `${duration.toFixed(1)}s` },
    {
      label: "Time range",
      value: `${formatClock(activeShort.startSeconds)}–${formatClock(activeShort.endSeconds)}`,
    },
    { label: "Captions", value: `${activeShort.cueCount} cues` },
  ];

  return (
    <section className="flex flex-col gap-4" aria-label="Generated short clip">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-semibold tracking-widest text-brand uppercase">
                Short #{activeShort.rank} · ready
              </p>
              <CardTitle className="font-heading text-xl tracking-tight sm:text-2xl">
                {activeShort.title}
              </CardTitle>
              <CardDescription>
                {formatClock(activeShort.startSeconds)} →{" "}
                {formatClock(activeShort.endSeconds)} · {duration.toFixed(1)}s
                {projectTitle ? ` from “${projectTitle}”` : ""}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-brand/10 text-brand">
              SEO {activeShort.seoScore ?? "–"}/100
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <div className="mx-auto w-full max-w-[340px] lg:mx-0">
            <ShortPlayer
              src={playbackUrl}
              startSeconds={activeShort.startSeconds}
              endSeconds={activeShort.endSeconds}
              captionsVtt={activeShort.captionsVtt}
              captionsSrt={activeShort.captionsSrt}
              captionStyleJson={activeShort.captionStyleJson}
              title={activeShort.title}
              thumbnailUrl={thumbnailUrl}
            />
          </div>
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2"
                >
                  <dt className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
                    {s.label}
                  </dt>
                  <dd className="mt-0.5 text-sm font-semibold">{s.value}</dd>
                </div>
              ))}
            </dl>

            <section className="flex flex-col gap-1.5">
              <h3 className="text-xs font-semibold tracking-widest text-brand uppercase">
                Why this clip matters
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {activeShort.reason ??
                  "Gemini didn't record a reason for this moment."}
              </p>
            </section>
            <Separator />
            {activeShort.hook ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold tracking-widest text-brand uppercase">
                  Hook
                </h3>
                <p className="text-sm leading-relaxed italic">
                  {activeShort.hook}
                </p>
              </section>
            ) : null}
            {activeShort.transcriptSnippet ? (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold tracking-widest text-brand uppercase">
                  Transcript
                </h3>
                <p className="line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                  {activeShort.transcriptSnippet}
                </p>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={() => onEdit(activeShort)}>
                <Pencil data-icon="inline-start" /> Edit captions
              </Button>
              {playbackUrl ? (
                <ClipDownloadButtons
                  projectId={projectId}
                  shorts={shorts}
                  activeShort={activeShort}
                  playbackOk={Boolean(playbackUrl)}
                />
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDownload(activeShort, "srt")}
                disabled={!activeShort.captionsSrt}
              >
                <Download data-icon="inline-start" /> SRT
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDownload(activeShort, "vtt")}
                disabled={!activeShort.captionsVtt}
              >
                <Download data-icon="inline-start" /> VTT
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDownloadInfo(activeShort)}
              >
                <FileText data-icon="inline-start" /> Clip info
              </Button>
              <Button size="sm" variant="secondary" render={<Link href={scheduleHref} />}>
                <Calendar data-icon="inline-start" /> Schedule video
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onRerun}
                disabled={analyzing}
              >
                <Sparkles data-icon="inline-start" />
                {analyzing ? "Re-running…" : "Re-run analysis"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {shorts.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scissors className="size-4 text-brand" aria-hidden />
              All shorts ({shorts.length})
            </CardTitle>
            <CardDescription>
              Switch the preview — the player, captions and details update
              instantly.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shorts.map((s) => {
              const selected = s.id === activeShort.id;
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 transition-colors",
                    selected
                      ? "border-brand/40 bg-brand/10"
                      : "border-border/60 bg-card",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(s.id)}
                    aria-pressed={selected}
                    className="block w-full text-left"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        #{s.rank} {s.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        SEO {s.seoScore ?? "–"}
                      </span>
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatClock(s.startSeconds)}–{formatClock(s.endSeconds)} ·{" "}
                      {clipDuration(s).toFixed(1)}s
                    </span>
                  </button>
                  <Button
                    size="xs"
                    variant="outline"
                    className="mt-2"
                    onClick={() => onEdit(s)}
                  >
                    <Pencil data-icon="inline-start" /> Edit
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
