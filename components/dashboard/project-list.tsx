"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Clapperboard, ExternalLink, Film, Scissors } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Project = {
  id: string;
  title: string;
  fileName: string | null;
  status: string;
  progress: number;
  playbackUrl: string | null;
  sourceUrl: string | null;
  sourceKind: string | null;
  error: string | null;
  createdAt: string;
  shortsCount?: number;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default";
  if (status === "failed") return "destructive";
  if (status === "processing" || status === "uploading") return "secondary";
  return "outline";
}

/** Live project list — refreshes every 5s so polling uploads appear. */
export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/projects/list");
        if (!res.ok) return;
        const json = (await res.json()) as { projects: Project[] };
        if (alive) setProjects(json.projects);
      } catch { /* dashboard still renders */ } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your projects</CardTitle>
        <CardDescription>
          Every upload creates a project — status updates live via polling. Click a project to watch it and see its AI clips.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Film className="size-5" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No projects yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Upload your first long video and FastXClip will find the moments worth posting.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((p) => {
              const clips = p.shortsCount ?? 0;
              return (
              <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-border/70 bg-background/60 px-4 py-3 transition-colors hover:border-brand/30">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand hover:underline hover:underline-offset-4"
                  >
                    {p.title}
                  </Link>
                  <Badge variant={statusVariant(p.status)}>{p.status} · {p.progress}%</Badge>
                  {clips > 0 ? (
                    <Badge variant="secondary" className="gap-1">
                      <Scissors className="size-3" aria-hidden />
                      {clips} clip{clips === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{p.id}</p>
                {p.status !== "ready" && p.status !== "failed" ? (
                  <Progress value={p.progress} aria-label={`${p.title}: ${p.progress} percent`} />
                ) : null}
                {p.error ? <p className="text-xs text-destructive">{p.error}</p> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/dashboard/projects/${p.id}`}
                    className="inline-flex w-fit items-center gap-1 text-xs text-brand underline underline-offset-4"
                  >
                    <Clapperboard className="size-3" aria-hidden />
                    Open project &amp; clips
                  </Link>
                  {p.playbackUrl ? (
                    <a href={p.playbackUrl} target="_blank" rel="noreferrer"
                      className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
                      View source in Storj <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
