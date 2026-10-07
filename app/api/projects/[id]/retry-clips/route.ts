import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects, shorts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { SHORTS_CONFIG } from "@/lib/shorts-config";
import type { TranscriptWord } from "@/lib/deepgram";
import {
  attachCaptionsToMoments,
  isTransientGeminiError,
  selectViralMoments,
  sliceCaptionsForRange,
} from "@/lib/gemini-shorts";

export const maxDuration = 60;

function friendlyClipError(raw: string): { message: string; retryable: boolean } {
  const retryable = isTransientGeminiError(raw);
  if (retryable) {
    return {
      retryable: true,
      message:
        "Gemini is overloaded right now (high demand) — your transcript is saved. " +
        "Wait a minute and hit \u201cRetry clips\u201d (no re-transcription needed). " +
        `Details: ${raw.slice(0, 300)}`,
    };
  }
  return { retryable: false, message: `Clip selection failed: ${raw.slice(0, 500)}` };
}

/**
 * POST /api/projects/:id/retry-clips — re-runs ONLY Gemini viral-moment
 * selection from the saved transcript (no Deepgram re-transcription).
 *
 * Use when a project ends up `ready` with a transcript but zero shorts
 * because Gemini 503'd (transient overload). Idempotent: existing shorts
 * for the project are replaced on success, untouched on failure.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  const project = rows[0];
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.transcriptText?.trim()) {
    return NextResponse.json(
      { error: "No transcript saved yet — run AI analysis first", code: "NO_TRANSCRIPT" },
      { status: 409 },
    );
  }

  const transcriptText = project.transcriptText;
  const duration = project.transcriptDuration ? Number(project.transcriptDuration) : null;
  let words: TranscriptWord[] = [];
  try {
    const parsed = JSON.parse(project.transcriptWordsJson ?? "[]") as Array<
      [string, number, number]
    >;
    if (Array.isArray(parsed)) {
      words = parsed
        .filter((w) => Array.isArray(w) && typeof w[0] === "string")
        .map((w) => ({ word: w[0], start: Number(w[1]) || 0, end: Number(w[2]) || 0 }));
    }
  } catch {
    words = [];
  }

  try {
    const moments = await selectViralMoments({
      transcriptText,
      duration: Number.isFinite(duration as number) ? (duration as number) : null,
      count: SHORTS_CONFIG.count,
      minSeconds: SHORTS_CONFIG.minSeconds,
      maxSeconds: SHORTS_CONFIG.maxSeconds,
    });

    const withCaptions =
      words.length > 0
        ? attachCaptionsToMoments(moments, words)
        : moments.map((m) => {
            const total = Number(duration) || 1;
            const s = sliceCaptionsForRange(
              [],
              m.start,
              m.end,
              transcriptText.slice(
                Math.floor((transcriptText.length * m.start) / Math.max(1, total)),
                Math.floor((transcriptText.length * m.end) / Math.max(1, total)),
              ),
            );
            return {
              ...m,
              transcriptSnippet: s.snippet || transcriptText.slice(0, 300),
              captionsSrt: s.srt,
              captionsVtt: s.vtt,
              cueCount: s.cueCount,
              durationSeconds: Math.round((m.end - m.start) * 10) / 10,
            };
          });

    // Replace existing shorts atomically: delete first, then insert. If the
    // insert throws, the project keeps its transcript and a null error is
    // never written — the catch below surfaces the failure instead.
    await db.delete(shorts).where(eq(shorts.projectId, id));
    const saved = await db
      .insert(shorts)
      .values(
        withCaptions.map((m) => ({
          id: `sht_${randomUUID()}`,
          projectId: id,
          userId,
          rank: m.rank,
          title: m.title,
          startSeconds: m.start,
          endSeconds: m.end,
          durationSeconds: m.durationSeconds,
          reason: m.reason,
          hook: m.hook ?? null,
          seoScore: m.seoScore,
          transcriptSnippet: m.transcriptSnippet,
          captionsSrt: m.captionsSrt,
          captionsVtt: m.captionsVtt,
          cueCount: m.cueCount,
          status: "ready" as const,
        })),
      )
      .returning({ id: shorts.id });

    await db
      .update(projects)
      .set({ error: null, status: "ready", progress: 100, updatedAt: new Date() })
      .where(eq(projects.id, id));

    return NextResponse.json({ ok: true, shortsCount: saved.length, projectId: id });
  } catch (err) {
    const raw = (err as Error)?.message ?? "Clip selection failed";
    const friendly = friendlyClipError(raw);
    console.warn(`[retry-clips] project=${id}: ${raw.slice(0, 300)}`);
    await db
      .update(projects)
      .set({ error: `Transcript ready, but clip selection failed: ${friendly.message}`, updatedAt: new Date() })
      .where(eq(projects.id, id));
    return NextResponse.json(
      { error: friendly.message, code: friendly.retryable ? "GEMINI_OVERLOADED" : "CLIP_FAILED", retryable: friendly.retryable },
      { status: friendly.retryable ? 503 : 500 },
    );
  }
}
