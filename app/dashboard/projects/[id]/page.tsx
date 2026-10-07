"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Captions,
  Clapperboard,
  FileText,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ShortClipShowcase,
  type ShortClip,
} from "@/components/dashboard/short-clip-showcase";
import { ShortCaptionEditor } from "@/components/dashboard/short-caption-editor";

type ProjectDetail = {
  id: string;
  title: string;
  status: string;
  progress: number;
  playbackUrl: string | null;
  sourceUrl: string | null;
  sourceKind: string | null;
  error: string | null;
  transcriptText: string | null;
  captionsSrt: string | null;
  captionsVtt: string | null;
  transcriptLanguage: string | null;
  transcriptDuration: string | null;
};

type ClipStep = {
  key: string;
  title: string;
  description: string;
  minProgress: number;
};

/** Served by GET /api/projects/:id — same shape as the showcase's ShortClip. */
type ShortItem = ShortClip;

const CLIP_STEPS: ClipStep[] = [
  {
    key: "upload",
    title: "Video uploaded",
    description: "Source bytes are stored in Storj and playable.",
    minProgress: 0,
  },
  {
    key: "queue",
    title: "Analysis queued",
    description: "AI analysis requested — Inngest picked up the job.",
    minProgress: 5,
  },
  {
    key: "transcribe",
    title: "Transcribing with Deepgram",
    description: "Full-video speech-to-text over the uploaded file.",
    minProgress: 35,
  },
  {
    key: "moments",
    title: "Finding viral moments with Gemini",
    description: "Transcript goes to Gemini for the best 30-90s clips.",
    minProgress: 55,
  },
  {
    key: "captions",
    title: "Generating captions",
    description: "Word timings become SRT + VTT caption tracks.",
    minProgress: 80,
  },
  {
    key: "clips",
    title: "Short clips",
    description: "Transcript + shorts saved — one row per short.",
    minProgress: 100,
  },
];

function stepState(
  step: ClipStep,
  idx: number,
  progress: number,
  status: string,
  hasTranscript: boolean,
) {
  if (status === "failed") return "upcoming" as const;
  const nextMin = CLIP_STEPS[idx + 1]?.minProgress ?? 101;
  if (step.key === "clips") {
    if (hasTranscript || (status === "ready" && progress >= 100))
      return "done" as const;
    return progress >= 80 ? ("active" as const) : ("upcoming" as const);
  }
  if (progress >= nextMin) return "done" as const;
  if (progress >= step.minProgress) return "active" as const;
  return "upcoming" as const;
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [shorts, setShorts] = useState<ShortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeShortId, setActiveShortId] = useState<string | null>(null);
  const [editingShort, setEditingShort] = useState<ShortItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) return;
      const json = (await res.json()) as { project: ProjectDetail; shorts?: ShortItem[] };
      setProject(json.project);
      setShorts(json.shorts ?? []);
    } catch {
      /* polling keeps trying */
    } finally {
      setLoading(false);
    }
  }, [id]);

  const progress = project?.progress ?? 0;
  const status = project?.status ?? "requesting_upload";
  const hasTranscript = Boolean(project?.transcriptText);
  // Shorts exist -> the Remotion showcase replaces the progress panel.
  const shortsReady = shorts.length > 0 && status !== "failed";

  useEffect(() => {
    load();
    // Poll fast while clips generate; once shorts are ready the Remotion
    // showcase replaces the progress panel, so back off to avoid hammering
    // the API (and re-rendering the player).
    const t = setInterval(() => {
      if (document.hidden) return;
      void load();
    }, shortsReady ? 15000 : 2000);
    return () => clearInterval(t);
  }, [load, shortsReady]);
  const activeShort =
    shorts.find((s) => s.id === activeShortId) ?? shorts[0] ?? null;
  const youTubeId = (() => {
    const src = project?.sourceUrl ?? project?.playbackUrl ?? "";
    const m =
      src.match(/(?:youtube\.com\/watch\?.*v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/live\/)([\w-]{6,})/) ??
      src.match(/youtu\.be\/([\w-]{6,})/);
    return m?.[1]?.split(/[?&#]/)[0] ?? null;
  })();
  const isYouTubeLink = (project?.sourceKind ?? "").toLowerCase() === "youtube" || youTubeId !== null;
  const youTubeEmbedUrl = youTubeId ? `https://www.youtube.com/embed/${youTubeId}` : null;

  const analyzingRef = useRef(false);
  const startAnalysis = async () => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    setAnalyzing(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/projects/${id}/analyze`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Analysis failed (${res.status})`);
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  };

  // Cheap recovery when Gemini 503s: the transcript is already saved, so
  // retry ONLY clip selection (no Deepgram re-transcription, no Inngest).
  // Shows when the project has a transcript but zero shorts.
  const clipFailure = !shortsReady && hasTranscript && status === "ready";
  const retryClips = async () => {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    setAnalyzing(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/projects/${id}/retry-clips`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        shortsCount?: number;
      };
      if (!res.ok) throw new Error(body.error ?? `Retry failed (${res.status})`);
      await load();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      analyzingRef.current = false;
      setAnalyzing(false);
    }
  };

  const transcriptPreview = useMemo(() => {
    const t = project?.transcriptText ?? "";
    return t.length > 600 ? `${t.slice(0, 600)}…` : t;
  }, [project?.transcriptText]);

  const download = (kind: "srt" | "vtt") => {
    const text =
      kind === "srt" ? project?.captionsSrt : project?.captionsVtt;
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.title ?? "transcript"}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadShort = (s: ShortItem, kind: "srt" | "vtt") => {
    const text = kind === "srt" ? s.captionsSrt : s.captionsVtt;
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `short-${s.rank}.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Downloads the short's metadata (reason, SEO score, timings) as JSON. */
  const downloadShortMeta = (s: ShortItem) => {
    const payload = {
      projectId: id,
      projectTitle: project?.title ?? null,
      sourceVideoUrl: project?.playbackUrl ?? null,
      short: {
        id: s.id,
        rank: s.rank,
        title: s.title,
        startSeconds: s.startSeconds,
        endSeconds: s.endSeconds,
        durationSeconds: s.durationSeconds,
        reason: s.reason,
        hook: s.hook,
        seoScore: s.seoScore,
        cueCount: s.cueCount,
        transcriptSnippet: s.transcriptSnippet,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `short-${s.rank}-info.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
          <ArrowLeft data-icon="inline-start" /> Back to dashboard
        </Button>
        <Badge
          variant={
            status === "failed"
              ? "destructive"
              : shortsReady
                ? "default"
                : "secondary"
          }
        >
          {status === "failed"
            ? "failed"
            : shortsReady
              ? `ready · ${shorts.length} shorts`
              : `${status} · ${progress}%`}
        </Badge>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">
          Project {id}
        </p>
        <h1 className="font-heading max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          {loading ? "Loading project…" : (project?.title ?? "Untitled video")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          {shortsReady
            ? `${shorts.length} short clip${shorts.length === 1 ? "" : "s"} ready — preview each one with synced captions, review why it works, then download or schedule.`
            : "Generating short clips — transcription runs first, then captions, then clip detection."}
        </p>
      </div>

      {actionError ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <X className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <p className="text-sm">{actionError}</p>
        </div>
      ) : null}
      {project?.error ? (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
          <X className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">{project.error}</p>
          {clipFailure ? (
            <Button size="sm" variant="outline" onClick={retryClips} disabled={analyzing || loading}>
              {analyzing ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              Retry clips
            </Button>
          ) : null}
        </div>
      ) : null}

      {shortsReady && activeShort ? (
        <>
          <ShortClipShowcase
            projectId={id}
            shorts={shorts}
            activeShort={activeShort}
            onSelect={setActiveShortId}
            playbackUrl={project?.playbackUrl ?? null}
            thumbnailUrl={
              youTubeId
                ? `https://i.ytimg.com/vi/${youTubeId}/hqdefault.jpg`
                : null
            }
            projectTitle={project?.title ?? null}
            analyzing={analyzing}
            onRerun={startAnalysis}
            onDownload={downloadShort}
            onDownloadInfo={downloadShortMeta}
            onEdit={(s) => {
              setEditingShort(s);
              setEditorOpen(true);
            }}
          />
          <ShortCaptionEditor
            short={editingShort}
            open={editorOpen}
            onOpenChange={setEditorOpen}
            playbackUrl={project?.playbackUrl ?? null}
            thumbnailUrl={
              youTubeId
                ? `https://i.ytimg.com/vi/${youTubeId}/hqdefault.jpg`
                : null
            }
            onSaved={(updated) => {
              setShorts((prev) =>
                prev.map((x) => (x.id === updated.id ? updated : x)),
              );
            }}
          />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clapperboard className="size-4 text-brand" aria-hidden />
              Generating your shorts
            </CardTitle>
            <CardDescription>
              {status === "failed"
                ? "Analysis failed — check the error above, then re-run."
                : "Live progress while Inngest transcribes the upload and Gemini picks the best moments."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2" aria-live="polite">
              <div className="flex items-center justify-between text-sm">
                <p className="font-medium">
                  {status === "failed"
                    ? "Analysis failed"
                    : hasTranscript
                      ? "Transcript ready"
                      : progress < 35
                        ? "Queuing transcription…"
                        : progress < 100
                          ? "Transcribing video…"
                          : "Wrapping up…"}
                </p>
                <p className="tabular-nums text-muted-foreground">{progress}%</p>
              </div>
              <Progress value={progress} aria-label={`Clip progress: ${progress} percent`} />
            </div>
            <Separator />
            <ol className="flex flex-col gap-3">
              {CLIP_STEPS.map((s, i) => {
                const state = stepState(s, i, progress, status, hasTranscript);
                return (
                  <li
                    key={s.key}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                      state === "done" && "border-brand/30 bg-brand/10",
                      state === "active" && "border-border/70 bg-muted/20",
                      state === "upcoming" && "border-border/50 opacity-70",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                        state === "done" && "bg-brand/15 text-brand",
                        state === "active" && "bg-muted text-foreground",
                        state === "upcoming" && "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {state === "done" ? (
                        <BadgeCheck className="size-4" aria-hidden />
                      ) : state === "active" ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <span className="text-xs font-semibold">{i + 1}</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.description}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={startAnalysis} disabled={analyzing || loading}>
                {analyzing ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                {hasTranscript ? "Re-run AI analysis" : "Start AI analysis"}
              </Button>
              {clipFailure ? (
                <Button size="sm" variant="outline" onClick={retryClips} disabled={analyzing || loading}>
                  {analyzing ? (
                    <Loader2 data-icon="inline-start" className="animate-spin" />
                  ) : (
                    <Sparkles data-icon="inline-start" />
                  )}
                  Retry clips (transcript saved)
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Deepgram transcribes the full video, captions are built from word
              timings, then Gemini picks the best 30–90s moments (start/end +
              reason + SEO score). The moment a short is ready, this panel is
              replaced by the Remotion player preview.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Source video</CardTitle>
              <CardDescription>
                {isYouTubeLink
                  ? "YouTube link — transcribes via captions"
                  : project?.playbackUrl
                    ? "Uploaded file"
                    : "Waiting for playback URL"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isYouTubeLink && youTubeEmbedUrl ? (
                <iframe
                  key={youTubeEmbedUrl}
                  src={youTubeEmbedUrl}
                  title="YouTube source"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10"
                />
              ) : project?.playbackUrl ? (
                <video
                  key={project.playbackUrl}
                  src={project.playbackUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-foreground/10"
                />
              ) : (
                <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-xl bg-muted/20 text-sm text-muted-foreground">
                  <UploadCloud className="size-5" aria-hidden />
                  {loading ? "Loading…" : "Video not playable yet"}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-brand" aria-hidden />
                Transcript
              </CardTitle>
              <CardDescription>
                {project?.transcriptLanguage
                  ? `Language: ${project.transcriptLanguage}`
                  : "Appears after Deepgram finishes"}
                {project?.transcriptDuration
                  ? ` · ${Number(project.transcriptDuration).toFixed(1)}s`
                  : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {hasTranscript ? (
                <>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {transcriptPreview}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!project?.captionsSrt}
                      onClick={() => download("srt")}
                    >
                      <Captions data-icon="inline-start" /> Download SRT
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!project?.captionsVtt}
                      onClick={() => download("vtt")}
                    >
                      <Captions data-icon="inline-start" /> Download VTT
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {progress > 5
                    ? "Transcription in progress — polling for results…"
                    : "Click Start AI analysis to transcribe this video."}
                </div>
              )}
            </CardContent>
          </Card>

          <Link
            href="/dashboard"
            className="text-xs text-muted-foreground underline underline-offset-4"
          >
            Back to all projects
          </Link>
      </div>
    </main>
  );
}



