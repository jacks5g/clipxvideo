"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Clapperboard,
  CloudUpload,
  Film,
  Link2,
  Loader2,
  MonitorPlay,
  RotateCcw,
  Sparkles,
  Tv,
  Play,
  Upload,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SourceTab = "file" | "link";
type UploadPhase = "idle" | "creating" | "waiting" | "uploading" | "processing" | "done" | "error";

type ProjectStatus = {
  id: string;
  status: string;
  progress: number;
  playbackUrl: string | null;
  error: string | null;
  storageKey: string | null;
};

type LoadedLink =
  | { kind: "youtube"; original: string; videoId: string; embedUrl: string; thumbnail: string }
  | { kind: "twitch"; original: string; embedUrl: string; label: string };

const ACCEPTED_TYPES = "video/mp4,video/quicktime,video/webm,video/x-matroska";
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Human "xh ym" for quota reset countdowns. */
function formatReset(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.ceil((totalSeconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getYouTubeId(url: string): string | null {
  const res = [
    /(?:youtube\.com\/watch\?.*v=|youtube\.com\/shorts\/|youtube\.com\/embed\/|youtube\.com\/live\/)([\w-]{6,})/,
    /youtu\.be\/([\w-]{6,})/,
  ];
  for (const re of res) {
    const m = url.match(re);
    if (m?.[1]) return m[1].split(/[?&#]/)[0];
  }
  return null;
}

function parseVideoLink(raw: string): LoadedLink | null {
  const original = raw.trim();
  if (!original) return null;
  const ytId = getYouTubeId(original);
  if (ytId) {
    return {
      kind: "youtube",
      original,
      videoId: ytId,
      embedUrl: `https://www.youtube.com/embed/${ytId}`,
      thumbnail: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
    };
  }
  const tm = original.match(/twitch\.tv\/(?:videos\/(\d+)|([A-Za-z0-9_]{2,25}))/);
  const cm = original.match(/clips\.twitch\.tv\/([\w-]+)/);
  if (tm || cm) {
    let embedUrl = "https://player.twitch.tv/?autoplay=false&muted=true";
    let label = "Twitch stream";
    if (tm?.[1]) { embedUrl += `&video=v${tm[1]}`; label = `Twitch VOD · ${tm[1]}`; }
    else if (tm?.[2]) { embedUrl += `&channel=${tm[2]}`; label = `Twitch channel · ${tm[2]}`; }
    else if (cm?.[1]) { embedUrl += `&video=${cm[1]}`; label = `Twitch clip · ${cm[1]}`; }
    embedUrl += "&parent=localhost";
    return { kind: "twitch", original, embedUrl, label };
  }
  return null;
}

function stageFor(p: number, phase?: UploadPhase, status?: string) {
  if (phase === "error") return "Upload failed";
  if (phase === "done") return "Upload complete";
  if (status === "ready") return "Upload complete";
  if (phase === "creating") return "Creating project…";
  if (phase === "waiting") return "Preparing Storj upload…";
  if (phase === "processing" || status === "processing") return "Finalizing in Storj…";
  if (p < 25) return "Uploading chunks…";
  if (p < 60) return "Uploading… holding connection";
  if (p < 90) return "Finalizing upload…";
  if (p < 100) return "Wrapping up…";
  return "Upload complete";
}

/** PUT bytes straight to Storj with real XHR progress events. */
function putToStorj(url: string, file: File, onProgress: (pct: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storj PUT failed (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error("Network error during Storj upload"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
}

async function fetchUploadUrl(projectId: string, attempts = 12): Promise<string> {
  // The Inngest prepare step may still be running — retry with backoff.
  let lastErr = "";
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`/api/projects/${projectId}/upload-url`);
    if (res.ok) {
      const json = (await res.json()) as { uploadUrl: string };
      return json.uploadUrl;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    lastErr = body.error ?? `HTTP ${res.status}`;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Storj upload never prepared: ${lastErr}`);
}

export function VideoUploadHero() {
  const router = useRouter();
  const [tab, setTab] = useState<SourceTab>("file");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [loadedLink, setLoadedLink] = useState<LoadedLink | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  // Daily quota (17 uploads / day, resets next day) — from GET /api/projects/quota.
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number; resetsInSeconds: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const phaseRef = useRef<UploadPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load daily upload quota once + refresh after each upload finishes.
  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/projects/quota");
      if (!res.ok) return;
      const json = (await res.json()) as {
        limit: number;
        used: number;
        remaining: number;
        resetsInSeconds: number;
      };
      setQuota(json);
    } catch {
      /* quota display is best-effort */
    }
  }, []);
  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const hasFileSource = file !== null && fileUrl !== null;
  const hasLinkSource = loadedLink !== null;
  const hasSource = hasFileSource || hasLinkSource;
  const activeLabel = hasFileSource ? file!.name : (loadedLink?.original ?? "No video selected");

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (pollRef.current) clearInterval(pollRef.current);
      abortRef.current?.abort();
    };
  }, [fileUrl]);

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const pickFile = useCallback((candidate: File | undefined | null) => {
    setFileError(null);
    if (!candidate) return;
    if (!candidate.type.startsWith("video/")) {
      setFileError("That file isn't a video. Pick an MP4, MOV, or WebM.");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setFileError("That file is over 2 GB. Pick a smaller file for now.");
      return;
    }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(candidate);
    setFileUrl(URL.createObjectURL(candidate));
    setPhase("idle");
    setProgress(0);
  }, [fileUrl]);

  const handleLoadLink = () => {
    const parsed = parseVideoLink(linkInput);
    if (!parsed) { setLinkError("Paste a valid YouTube or Twitch link to continue."); return; }
    try {
      const u = new URL(parsed.original);
      if (!/youtube\.com|youtu\.be|twitch\.tv/.test(u.hostname)) {
        setLinkError("Only YouTube and Twitch links are supported right now.");
        return;
      }
    } catch { setLinkError("That doesn't look like a valid URL."); return; }
    setLinkError(null);
    setLoadedLink(parsed);
    setPhase("idle");
    setProgress(0);
  };

  const clearFile = () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(null); setFileUrl(null); setFileError(null);
    if (!hasLinkSource) { setPhase("idle"); setProgress(0); }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const clearLink = () => {
    setLoadedLink(null); setLinkInput(""); setLinkError(null);
    if (!hasFileSource) { setPhase("idle"); setProgress(0); }
  };

  const clearAll = () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(null); setFileUrl(null); setFileError(null);
    setLoadedLink(null); setLinkInput(""); setLinkError(null);
    stopPolling(); abortRef.current?.abort();
    setPhase("idle"); setProgress(0);
    setProjectId(null); setServerStatus(null); setPlaybackUrl(null); setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** Poll GET /api/projects/:id every 2s and mirror status/progress to UI. */
  const pollUntilReady = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (!res.ok) return;
        const json = (await res.json()) as { project: ProjectStatus };
        const p = json.project;
        setServerStatus(p.status);
        // During byte transfer XHR owns the bar; otherwise mirror the server.
        if (phaseRef.current !== "uploading") setProgress(p.progress);
        if (p.status === "ready") {
          stopPolling();
          setPlaybackUrl(p.playbackUrl);
          setProgress(100);
          setPhase("done");
        } else if (p.status === "failed") {
          stopPolling();
          setUploadError(p.error ?? "Upload failed");
          setPhase("error");
        } else if (p.status === "processing") {
          setPhase((prev) => (prev === "uploading" ? prev : "processing"));
          setProgress((prev) => Math.max(prev, 85));
        }
      } catch { /* keep polling */ }
    }, 2000);
  };

  /** Trigger Inngest AI analysis, then navigate to the project page. */
  const startAnalysis = async () => {
    if (!projectId || analyzing) return;
    setAnalyzing(true);
    setUploadError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Analysis failed (${res.status})`);
      stopPolling();
      router.push(`/dashboard/projects/${projectId}`);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const startUpload = async () => {
    if (!hasSource || phase === "creating" || phase === "waiting" || phase === "uploading" || phase === "processing") return;
    setUploadError(null);
    setPlaybackUrl(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // 1) Create a NEW project row — also fires the Inngest function.
      setPhase("creating");
      setProgress(3);
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          hasFileSource
            ? { title: file!.name.replace(/\.[a-z0-9]+$/i, ""), fileName: file!.name, mimeType: file!.type || "video/mp4", sizeBytes: file!.size }
            : {
                title: loadedLink!.kind === "youtube" ? "YouTube video" : loadedLink!.kind,
                fileName: "link-import.mp4",
                mimeType: "video/mp4",
                sourceUrl: loadedLink!.original,
                sourceKind: loadedLink!.kind,
              }
        ),
        signal: controller.signal,
      });
      if (!createRes.ok) {
        const body = (await createRes.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          retryAfterSeconds?: number;
          remaining?: number;
        };
        // Daily-limit responses carry code + reset info — refresh the badge.
        if (body.code === "DAILY_LIMIT") {
          refreshQuota();
          const retry =
            typeof body.retryAfterSeconds === "number" && body.retryAfterSeconds > 0
              ? ` Resets in ~${formatReset(body.retryAfterSeconds)}.`
              : " Resets tomorrow.";
          throw new Error(`${body.error ?? "Daily upload limit reached."}${retry}`);
        }
        throw new Error(body.error ?? `Project creation failed (${createRes.status})`);
      }
      const { project } = (await createRes.json()) as { project: { id: string } };
      setProjectId(project.id);
      refreshQuota();
      pollUntilReady(project.id);

      if (!hasFileSource) {
        // Link import: server downloads the watch page via Cobalt straight
        // into Storj (no browser bytes to PUT). Keep polling — the Inngest
        // download step flips the row to ready with the Storj playbackUrl.
        setPhase("waiting");
        setServerStatus("uploading");
        setProgress(15);
        const finRes = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          signal: controller.signal,
        });
        if (!finRes.ok) {
          const body = (await finRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Link download kickoff failed (${finRes.status})`);
        }
        // Polling picks up `ready` (bytes in Storj) or `failed` (e.g. private
        // video / downloader unreachable) and flips the UI to done/error.
        return;
      }

      // 2) Wait for the Inngest prepare step, then get the presigned PUT URL.
      setPhase("waiting");
      setProgress(10);
      const uploadUrl = await fetchUploadUrl(project.id);

      // 3) Stream bytes straight to Storj with REAL progress events.
      setPhase("uploading");
      await putToStorj(uploadUrl, file!, (pct) => {
        // Map 0-100 PUT progress onto the 20-85 band of the overall bar.
        setProgress(20 + Math.round(pct * 0.65));
      }, controller.signal);

      // 4) Tell the backend to finalize (Inngest verify + signed playback URL).
      setPhase("processing");
      setProgress(85);
      const doneRes = await fetch(`/api/projects/${project.id}/complete`, {
        method: "POST",
        signal: controller.signal,
      });
      if (!doneRes.ok) {
        const body = (await doneRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Finalize failed (${doneRes.status})`);
      }
      // Polling picks up `ready` + playbackUrl from here.
      setProgress(90);
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return; // cancelled
      stopPolling();
      setUploadError((err as Error).message);
      setPhase("error");
    }
  };

  const cancelUpload = () => {
    abortRef.current?.abort();
    stopPolling();
    setPhase("idle"); setProgress(0);
    setServerStatus(null); setUploadError(null);
  };
  const rounded = Math.floor(progress);
  const shortLabel = activeLabel.length > 48 ? `${activeLabel.slice(0, 48)}…` : activeLabel;

  return (
    <section aria-labelledby="upload-hero-heading"
      className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-black/40 ring-1 ring-foreground/10">
      <div aria-hidden className="absolute inset-0 bg-dot-grid opacity-70" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-56 bg-glow-top" />
      <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <Clapperboard className="size-3" aria-hidden /> New project
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {quota
                ? `${quota.remaining} / ${quota.limit} uploads left today`
                : "17 uploads / day"}
            </Badge>
          </div>
          <div className="flex flex-col gap-3">
            <h2 id="upload-hero-heading" className="font-heading max-w-xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Drop in a video, get <span className="text-gradient-brand">clips worth posting</span>
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Upload a file from your device or paste a YouTube / Twitch link.
              Preview it here, then hit upload — UI preview only for now.
            </p>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as SourceTab)} className="w-full">
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="file" className="gap-1.5"><CloudUpload aria-hidden /> Upload file</TabsTrigger>
              <TabsTrigger value="link" className="gap-1.5"><Link2 aria-hidden /> YouTube / Twitch</TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="pt-1">
              <div role="button" tabIndex={0} aria-label="Drop a video file or press Enter to browse"
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); pickFile(e.dataTransfer.files?.[0]); }}
                className={cn("group flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center transition-all duration-200",
                  isDragging ? "border-brand/60 bg-brand/10" : "border-border/70 bg-muted/20 hover:border-brand/40 hover:bg-muted/40")}>
                <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand">
                  <CloudUpload className="size-5" aria-hidden />
                </span>
                <p className="text-sm font-medium text-foreground">
                  {isDragging ? "Drop it — we'll take it from here" : "Drag & drop your video, or browse files"}
                </p>
                <p className="text-xs text-muted-foreground">MP4, MOV, WebM or MKV · up to 2 GB · 30s+ recommended</p>
                <Button type="button" size="sm" variant="secondary"
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                  <Film data-icon="inline-start" /> Select from device
                </Button>
                <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0])} />
              </div>
              {fileError ? <p role="alert" className="pt-2 text-xs text-destructive">{fileError}</p> : null}
              {hasFileSource ? (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                    <Film className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file!.name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file!.size)} · ready to preview</p>
                  </div>
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove selected file" onClick={clearFile}>
                    <X aria-hidden />
                  </Button>
                </div>
              ) : null}
            </TabsContent>
            <TabsContent value="link" className="pt-1">
              <Card className="gap-4 border-border/70 bg-background/60 py-4 shadow-none">
                <CardHeader className="px-4">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Link2 className="size-4 text-brand" aria-hidden /> Paste a video link
                  </CardTitle>
                  <CardDescription className="text-xs">
                    YouTube videos / Shorts transcribe via captions (no upload needed). Twitch needs a file upload.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleLoadLink(); }}
                      placeholder="https://youtube.com/watch?v=… or twitch.tv/…" inputMode="url"
                      aria-label="YouTube or Twitch video link" />
                    <Button type="button" onClick={handleLoadLink} className="shrink-0">Load video</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Play className="size-3.5" aria-hidden /> YouTube</span>
                    <Separator orientation="vertical" className="h-3" />
                    <span className="inline-flex items-center gap-1"><Tv className="size-3.5" aria-hidden /> Twitch</span>
                  </div>
                  {linkError ? <p role="alert" className="pt-2 text-xs text-destructive">{linkError}</p> : null}
                  {loadedLink ? (
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5">
                      {loadedLink.kind === "youtube" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={loadedLink.thumbnail} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover ring-1 ring-foreground/10" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                          <Tv className="size-4" aria-hidden />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium"><span className="truncate">
                          {loadedLink.kind === "youtube" ? `youtube.com/watch?v=${loadedLink.videoId}` : loadedLink.label}
                        </span></p>
                        <p className="truncate text-xs text-muted-foreground">{loadedLink.original}</p>
                      </div>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove pasted link" onClick={clearLink}>
                        <X aria-hidden />
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 p-4">
            {phase === "idle" && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="button" size="lg" disabled={!hasSource} onClick={startUpload}
                  className="bg-gradient-brand text-brand-foreground sm:min-w-44">
                  <Upload data-icon="inline-start" /> Upload video
                </Button>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {hasSource ? `${shortLabel} · ready when you are.` : "Select a file or load a link to enable upload."}
                </p>
              </div>
            )}
            {(phase === "creating" || phase === "waiting" || phase === "uploading" || phase === "processing") && (
              <div className="flex flex-col gap-2.5" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <p className="flex min-w-0 items-center gap-2 font-medium">
                    <span className="size-2 shrink-0 animate-pulse rounded-full bg-gradient-brand" />
                    <span className="truncate">{stageFor(rounded, phase, serverStatus ?? undefined)}</span>
                  </p>
                  <p className="shrink-0 tabular-nums text-muted-foreground">{rounded}%</p>
                </div>
                <Progress value={rounded} aria-label={`Uploading ${activeLabel}: ${rounded} percent`} className="w-full" />
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-muted-foreground">
                    {projectId ? `${projectId.slice(0, 18)}… · ${serverStatus ?? phase}` : activeLabel} · don&apos;t close this tab
                  </p>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelUpload}>Cancel</Button>
                </div>
              </div>
            )}
            {phase === "error" && (
              <div className="flex flex-col gap-3" aria-live="polite">
                <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5">
                  <X className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Upload failed</p>
                    <p className="text-xs break-words whitespace-normal text-muted-foreground">{uploadError ?? "Something went wrong."}</p>
                  </div>
                  <Badge variant="destructive">{rounded}%</Badge>
                </div>
                <Progress value={rounded} aria-label="Upload failed" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={startUpload}>
                    <RotateCcw data-icon="inline-start" /> Retry upload
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearAll} className="text-muted-foreground">
                    Start over
                  </Button>
                </div>
              </div>
            )}
            {phase === "done" && (
              <div className="flex flex-col gap-3" aria-live="polite">
                <div className="flex items-start gap-3 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2.5">
                  <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">Upload complete — saved to Storj</p>
                    <p className="truncate text-xs text-muted-foreground">{activeLabel} · AI clip detection is next.</p>
                    {projectId ? <p className="truncate text-[11px] text-muted-foreground">Project {projectId}</p> : null}
                  </div>
                  <Badge className="bg-gradient-brand text-brand-foreground">100%</Badge>
                </div>
                <Progress value={100} aria-label="Upload complete" />
                {playbackUrl ? (
                  <a href={playbackUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-brand underline underline-offset-4">
                    View uploaded video in Storj
                  </a>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={clearAll}>
                    <RotateCcw data-icon="inline-start" /> Upload another
                  </Button>
                  <Button type="button" size="sm" onClick={startAnalysis} disabled={analyzing || !projectId}>
                    {analyzing ? (
                      <Loader2 data-icon="inline-start" className="animate-spin" />
                    ) : (
                      <Sparkles data-icon="inline-start" />
                    )}
                    {analyzing ? "Starting analysis…" : "AI analysis"}
                  </Button>
                </div>
                {uploadError && phase === "done" ? (
                  <p role="alert" className="text-xs text-destructive">{uploadError}</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          <Card className="flex flex-1 flex-col gap-0 overflow-hidden border-border/70 bg-background/60 py-0">
            <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <MonitorPlay className="size-4 text-brand" aria-hidden /> Selected video
                </CardTitle>
                <CardDescription className="truncate text-xs">
                  {hasSource ? activeLabel : "Nothing selected yet"}
                </CardDescription>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={!hasSource} onClick={() => setPreviewOpen(true)}>
                Preview
              </Button>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3 px-4 py-4">
              {!hasSource ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
                  <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <MonitorPlay className="size-5" aria-hidden />
                  </span>
                  <p className="text-sm font-medium">Your video will appear here</p>
                  <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                    Pick a file or load a YouTube / Twitch link to see an instant preview.
                  </p>
                </div>
              ) : null}
              {hasFileSource ? (
                <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
                  <video key={fileUrl} src={fileUrl!} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
                </div>
              ) : null}
              {loadedLink && !hasFileSource ? (
                <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
                  <iframe key={loadedLink.embedUrl} src={loadedLink.embedUrl} title={`${loadedLink.kind} preview`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen className="aspect-video w-full bg-black" />
                </div>
              ) : null}
              {hasSource ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Source", value: hasFileSource && loadedLink ? "File + link" : hasFileSource ? "Local file" : loadedLink!.kind === "youtube" ? "YouTube" : "Twitch" },
                      { label: "Size", value: hasFileSource ? formatBytes(file!.size) : "Stream" },
                      { label: "Status", value: phase === "done" ? "Ready" : phase === "uploading" ? `${rounded}%` : "Staged" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg border border-border/70 bg-muted/20 px-2 py-2">
                        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{s.label}</p>
                        <p className="truncate text-xs font-medium">{s.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setPreviewOpen(true)}>
                      <MonitorPlay data-icon="inline-start" /> Open preview
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={clearAll} className="text-muted-foreground">
                      Clear selection
                    </Button>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl gap-4">
          <DialogHeader>
            <DialogTitle>Video preview</DialogTitle>
            <DialogDescription className="truncate">{activeLabel}</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            {hasFileSource ? (
              <video key={`pv-${fileUrl}`} src={fileUrl!} controls autoPlay playsInline className="aspect-video w-full bg-black" />
            ) : loadedLink ? (
              <iframe key={`pv-${loadedLink.embedUrl}`} src={loadedLink.embedUrl} title={`${loadedLink.kind} preview dialog`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen className="aspect-video w-full bg-black" />
            ) : (
              <div className="flex aspect-video items-center justify-center bg-muted/20 text-sm text-muted-foreground">No video selected.</div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Preview only — upload to start clip detection.</p>
            <Button type="button" size="sm" onClick={() => { setPreviewOpen(false); startUpload(); }}>
              <Upload data-icon="inline-start" /> Upload from preview
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}






