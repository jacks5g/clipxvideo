"use client";
/** Per-clip + bulk download buttons (vertical 9:16 + original + zip). */
import { useState } from "react";
import { Download, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ShortClip } from "./short-clip-showcase";
import { exportClip, clipProxyUrl, downloadBlob, type ExportMode } from "@/lib/clip-export";
import { clipFileName } from "@/lib/clip-filename";
import { filesToZip } from "@/lib/clip-zip";
type Props = { projectId: string; shorts: ShortClip[]; activeShort: ShortClip; playbackOk: boolean };
export function ClipDownloadButtons({ projectId, shorts, activeShort, playbackOk }: Props) {
  const [busy, setBusy] = useState<ExportMode | "all" | null>(null);
  const [frac, setFrac] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const one = async (s: ShortClip, mode: ExportMode) => {
    if (busy) return;
    setBusy(mode); setFrac(0); setErr(null);
    try {
      const { blob, ext } = await exportClip(clipProxyUrl(projectId, s.id), s, mode, setFrac);
      downloadBlob(blob, clipFileName(s.rank, s.title, ext, mode === "vertical" ? "9x16" : "orig"));
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); setFrac(0); }
  };
  const all = async () => {
    if (busy || shorts.length === 0) return;
    setBusy("all"); setFrac(0); setErr(null);
    try {
      const files: Array<{ name: string; blob: Blob }> = [];
      for (let i = 0; i < shorts.length; i++) {
        const s = shorts[i];
        const { blob, ext } = await exportClip(clipProxyUrl(projectId, s.id), s, "vertical", (f) => setFrac((i + f) / shorts.length));
        files.push({ name: clipFileName(s.rank, s.title, ext, "9x16"), blob });
      }
      const zip = await filesToZip(files);
      downloadBlob(zip, `project-${projectId.slice(0, 8)}-all-clips.zip`);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); setFrac(0); }
  };
  const label = (m: ExportMode | "all") => {
    if (busy !== m) return null;
    return `${Math.round(frac * 100)}%`;
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!playbackOk || busy !== null} onClick={() => one(activeShort, "vertical")}>
          {busy === "vertical" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
          {busy === "vertical" ? `Exporting 9:16 ${label("vertical") ?? ""}` : "Download 9:16 video"}
        </Button>
        <Button size="sm" variant="outline" disabled={!playbackOk || busy !== null} onClick={() => one(activeShort, "original")}>
          {busy === "original" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Download data-icon="inline-start" />}
          {busy === "original" ? `Exporting ${label("original") ?? ""}` : "Download original"}
        </Button>
        {shorts.length > 1 ? (
          <Button size="sm" variant="secondary" disabled={!playbackOk || busy !== null} onClick={all}>
            {busy === "all" ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Package data-icon="inline-start" />}
            {busy === "all" ? `Zipping ${label("all") ?? ""}` : `Download all (${shorts.length})`}
          </Button>
        ) : null}
      </div>
      {busy !== null ? <Progress value={Math.round(frac * 100)} aria-label="Export progress" /> : null}
      {!playbackOk ? <p className="text-xs text-muted-foreground">Video must finish uploading before clips can export.</p> : null}
      <p className="text-xs text-muted-foreground">Exports render in realtime with captions burned in (9:16 + original). Keep this tab visible.</p>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
    </div>
  );
}
