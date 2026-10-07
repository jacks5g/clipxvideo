"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clapperboard, Film, Scissors, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type LibraryProject = {
  id: string;
  title: string;
  status: string;
  progress: number;
  playbackUrl: string | null;
  error: string | null;
  shortsCount?: number;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default";
  if (status === "failed") return "destructive";
  if (status === "processing" || status === "uploading") return "secondary";
  return "outline";
}

export default function MyVideosPage() {
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/projects/list");
        if (!res.ok) return;
        const json = (await res.json()) as { projects: LibraryProject[] };
        if (alive) setProjects(json.projects ?? []);
      } catch {
        /* library still renders */
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const totalClips = projects.reduce((n, p) => n + (p.shortsCount ?? 0), 0);

  return (
    <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold tracking-widest text-brand uppercase">
          My Videos
        </p>
        <h1 className="font-heading max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Your video library
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Every long video you upload and every AI clip it produces will appear
          here, ready to preview, download, or schedule.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>
              All videos{loading ? "" : ` (${projects.length})`}
              {totalClips > 0 ? ` · ${totalClips} clip${totalClips === 1 ? "" : "s"}` : ""}
            </CardTitle>
            <CardDescription>
              {loading
                ? "Loading your library…"
                : projects.length === 0
                  ? "Upload your first source video to start generating shorts."
                  : "Click a video to watch it and open its generated shorts."}
            </CardDescription>
          </div>
          <Button size="sm" render={<Link href="/dashboard" />}>
            <Upload data-icon="inline-start" />
            Upload video
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading videos…</p>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Clapperboard className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-medium text-foreground">No videos yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Upload from the dashboard home page — file uploads and YouTube links are supported.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {projects.map((p) => {
                const clips = p.shortsCount ?? 0;
                return (
                  <li key={p.id}>
                    <Link
                      href={`/dashboard/projects/${p.id}`}
                      className="flex h-full flex-col gap-2 rounded-xl border border-border/70 bg-background/60 px-4 py-3 transition-colors hover:border-brand/40"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                          <Film className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </span>
                      {p.playbackUrl ? (
                        <span className="overflow-hidden rounded-lg bg-black ring-1 ring-foreground/10">
                          <video src={p.playbackUrl} preload="metadata" playsInline muted className="aspect-video w-full object-cover" />
                        </span>
                      ) : (
                        <span className="flex aspect-video items-center justify-center rounded-lg bg-muted/20 text-xs text-muted-foreground ring-1 ring-foreground/10">
                          {p.status === "failed" ? (p.error ?? "Failed") : `Processing · ${p.progress}%`}
                        </span>
                      )}
                      {p.status !== "ready" && p.status !== "failed" ? (
                        <Progress value={p.progress} aria-label={`${p.title}: ${p.progress} percent`} />
                      ) : null}
                      <span className="text-xs text-muted-foreground">
                        {clips > 0 ? (
                          <Badge variant="secondary" className="gap-1">
                            <Scissors className="size-3" aria-hidden />
                            {clips} clip{clips === 1 ? "" : "s"} — view
                          </Badge>
                        ) : (
                          <span>{p.status === "ready" ? "No clips yet — open to run AI analysis" : "Clips appear after AI analysis"}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
