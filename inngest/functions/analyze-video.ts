import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { getDb } from "@/db";
import { projects, shorts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getActualVideoUrl } from "@/lib/storj";
import { transcribeVideoUrl, type TranscriptWord } from "@/lib/deepgram";
import { buildCaptions } from "@/lib/captions";
import { SHORTS_CONFIG } from "@/lib/shorts-config";
import {
  attachCaptionsToMoments,
  isTransientGeminiError,
  selectViralMoments,
  sliceCaptionsForRange,
  type ViralMoment,
  type ViralMomentWithCaptions,
} from "@/lib/gemini-shorts";

type AnalysisRequestedData = {
  projectId: string;
  userId: string;
};

/**
 * AI analysis — Deepgram transcription + captions.
 *
 * Triggered from the upload-success UI ("AI analysis" / "Generate clips"):
 *   POST /api/projects/:id/analyze  ->  `video/analysis.requested`
 *
 * Steps:
 *   1. `load-video-url` — read the project, resolve the playable Storj URL
 *      (public URL or fresh signed GET), DB -> processing. Link imports must
 *      already be DOWNLOADED into Storj by the upload function — analysis
 *      requires a storageKey and Deepgrams the stored bytes.
 *   2. `transcribe-video` — Deepgram prerecorded `listen` over the COMPLETE
 *      Storj video URL + `build-captions` (SRT/VTT from word timings).
 *   3. `select-viral-moments` — runs IMMEDIATELY after transcription: sends
 *      the transcript to Gemini, gets the top N engaging 30-90s moments
 *      (start/end + reason + SEO score), slices per-short captions.
 *   4. `save-transcript-and-shorts` — persists transcript + captions AND
 *      inserts one `shorts` row per viral moment, DB -> ready.
 *
 * Short count is configured in `lib/shorts-config.ts` (SHORTS_COUNT env).
 *
 * The returned payload (transcript preview, caption counts, duration) shows
 * in the Inngest dashboard run output for testing. UI polls
 * GET /api/projects/:id for status/progress throughout.
 */
export const analyzeVideo = inngest.createFunction(
  {
    id: "analyze-video-transcribe",
    retries: 2,
    triggers: [{ event: "video/analysis.requested" }],
    // If Deepgram/Gemini throw (or retries exhaust), the project would
    // otherwise sit at `processing` forever with a spinning progress bar.
    // Mark it `failed` with the real reason so the UI shows the error + retry.
    // NOTE: onFailure is itself an Inngest function — original event data
    // lives under event.data.event.data and side effects need step.run.
    onFailure: async ({ event, step, error }) => {
      const data = ((event?.data as { event?: { data?: Partial<AnalysisRequestedData> } })?.event?.data ?? {}) as Partial<AnalysisRequestedData>;
      const projectId = data.projectId ?? "";
      if (!projectId) return;
      const reason =
        (error as Error)?.message?.slice(0, 2000) || "AI analysis failed";
      await step.run("mark-analysis-failed", async () => {
        const db = getDb();
        await db
          .update(projects)
          .set({ status: "failed", error: reason, updatedAt: new Date() })
          .where(eq(projects.id, projectId));
      });
    },
  },
  async ({ event, step }) => {
    const data = event.data as Partial<AnalysisRequestedData>;
    const projectId = data.projectId ?? "";
    const userId = data.userId ?? "";
    if (!projectId || !userId)
      throw new NonRetriableError(
        "video/analysis.requested missing projectId/userId",
      );

    const videoUrl = await step.run("load-video-url", async () => {
      const db = getDb();
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const project = rows[0];
      if (!project) throw new NonRetriableError(`Project ${projectId} not found`);
      if (project.userId !== userId)
        throw new NonRetriableError(`Project ${projectId} belongs to another user`);
      if (project.sourceUrl && !project.storageKey) {
        // Link import whose download hasn't finished (or failed) yet — the
        // upload function streams YouTube/Twitch links into Storj via Cobalt.
        throw new NonRetriableError(
          `Video download not finished yet (status: ${project.status}) — wait for the link download to reach Storj, then retry analysis.`,
        );
      }
      if (
        project.sourceUrl &&
        (project.status === "uploading" || project.status === "requesting_upload")
      ) {
        // storageKey minted but download step hasn't verified bytes yet.
        throw new NonRetriableError(
          `Video link download is in progress (${project.status}) — wait for it to finish, then retry analysis.`,
        );
      }
      if (!project.storageKey)
        throw new NonRetriableError(
          `Project ${projectId} has no stored video — upload it first`,
        );

      // Fresh playable URL (re-signed when STORJ_PUBLIC_URL is unset) so
      // Deepgram can fetch the complete video directly.
      const url = await getActualVideoUrl(project.storageKey);
      await db
        .update(projects)
        .set({
          status: "processing",
          progress: 10,
          playbackUrl: url,
          playbackUrlExpiresAt: process.env.STORJ_PUBLIC_URL
            ? null
            : new Date(Date.now() + 7 * 24 * 3600 * 1000),
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
      return url;
    });

    const transcribed = await step.run("transcribe-video", async () => {
      const db = getDb();
      await db
        .update(projects)
        .set({ status: "processing", progress: 55, updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      // Transcribe the COMPLETE Storj video via Deepgram (all sources —
      // file uploads AND downloaded YouTube/Twitch links — are real bytes
      // in Storj by this point). Snapshot persisted to the DB immediately.
      const result = await transcribeVideoUrl(videoUrl);
      const captions = buildCaptions(result);
      await db
        .update(projects)
        .set({
          transcriptText: result.text,
          captionsSrt: captions.srt,
          captionsVtt: captions.vtt,
          transcriptLanguage: result.language,
          transcriptDuration:
            result.duration !== null && result.duration !== undefined
              ? String(result.duration)
              : null,
          // Persist word timings for the next step's caption slicing.
          transcriptWordsJson: JSON.stringify(
            result.words.map((w) => [w.word, Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100]),
          ),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
      return {
        textLength: result.text.length,
        wordCount: result.words.length,
        language: result.language,
        duration: result.duration,
        cueCount: captions.cueCount,
        // NOTE: text/words/srt/vtt are NOT in step output (they live in
        // the DB snapshot above) — keeps outputs small for long videos.
        // The next step re-reads transcript + words from the DB.
        preview: result.text.slice(0, 500),
      };
    });

    // Runs AS SOON AS transcription finishes — Gemini picks the best
    // 30-90s engaging moments (start/end + reason + SEO score) and we
    // slice per-short captions for each range.
    const viralMoments = await step.run("select-viral-moments", async () => {
      const db = getDb();
      await db
        .update(projects)
        .set({ status: "processing", progress: 80, updatedAt: new Date() })
        .where(eq(projects.id, projectId));

      // Re-read transcript + word timings from the DB snapshot (never
      // from giant step outputs) — this step runs immediately after
      // `transcribe-video` persisted them.
      const snapRows = await db
        .select({
          text: projects.transcriptText,
          wordsJson: projects.transcriptWordsJson,
          duration: projects.transcriptDuration,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const snapText = snapRows[0]?.text ?? "";
      const snapDuration = snapRows[0]?.duration ? Number(snapRows[0].duration) : transcribed.duration;
      let words: TranscriptWord[] = [];
      try {
        const parsed = JSON.parse(snapRows[0]?.wordsJson ?? "[]") as Array<[string, number, number]>;
        if (Array.isArray(parsed)) {
          words = parsed
            .filter((w) => Array.isArray(w) && typeof w[0] === "string")
            .map((w) => ({ word: w[0], start: Number(w[1]) || 0, end: Number(w[2]) || 0 }));
        }
      } catch {
        words = [];
      }
      let moments: ViralMoment[];
      try {
        moments = await selectViralMoments({
          transcriptText: snapText,
          duration: Number.isFinite(snapDuration as number) ? (snapDuration as number) : null,
          count: SHORTS_CONFIG.count,
          minSeconds: SHORTS_CONFIG.minSeconds,
          maxSeconds: SHORTS_CONFIG.maxSeconds,
        });
      } catch (err) {
        // Never fail transcription because Gemini hiccuped — save the
        // transcript with zero shorts and surface the reason in the log.
        console.warn(`[analyze-video] Gemini shorts selection failed: ${(err as Error).message}`);
        return { moments: [] as ViralMomentWithCaptions[], shortsCount: 0, error: (err as Error).message };
      }
      // Slice per-short captions from word timings; when words are
      // missing, fall back to splitting the full transcript text.
      const withCaptions =
        words.length > 0
          ? attachCaptionsToMoments(moments, words)
          : moments.map((m) => {
              const s = sliceCaptionsForRange([], m.start, m.end, snapText.slice(
                Math.floor((snapText.length * m.start) / Math.max(1, Number(snapDuration) || 1)),
                Math.floor((snapText.length * m.end) / Math.max(1, Number(snapDuration) || 1)),
              ));
              return {
                ...m,
                transcriptSnippet: s.snippet || snapText.slice(0, 300),
                captionsSrt: s.srt,
                captionsVtt: s.vtt,
                cueCount: s.cueCount,
                durationSeconds: Math.round((m.end - m.start) * 10) / 10,
              };
            });
      return {
        moments: withCaptions,
        shortsCount: withCaptions.length,
        error: null as string | null,
      };
    });

    return await step.run("save-transcript-and-shorts", async () => {
      const db = getDb();
      // Snapshot written in `transcribe-video` holds the full captions —
      // re-read so this step never depends on giant step outputs.
      const snap = await db
        .select({
          text: projects.transcriptText,
          srt: projects.captionsSrt,
          vtt: projects.captionsVtt,
        })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const fullText = snap[0]?.text ?? transcribed.preview ?? "";
      // Surface a silent Gemini clip-pick failure on the project row itself.
      // Otherwise the UI shows "ready / No clips yet — open to run AI
      // analysis" which reads as "nothing was generated" with no retry cue.
      // Transient overload (503/429) gets an actionable hint pointing at the
      // cheap POST /api/projects/:id/retry-clips path (reuses the transcript,
      // no Deepgram re-transcription) instead of a raw API dump.
      let shortsError: string | null = null;
      if (viralMoments.error && viralMoments.moments.length === 0) {
        const raw = viralMoments.error;
        shortsError = isTransientGeminiError(raw)
          ? `Transcript ready, but Gemini is overloaded right now (high demand). ` +
            `Your transcript is saved — wait a minute and hit \u201cRetry clips\u201d ` +
            `(no re-transcription needed). Details: ${raw.slice(0, 300)}`
          : `Transcript ready, but clip selection failed: ${raw}`;
      }
      await db
        .update(projects)
        .set({
          status: "ready",
          progress: 100,
          transcriptText: fullText,
          captionsSrt: snap[0]?.srt ?? fullText,
          captionsVtt: snap[0]?.vtt ?? fullText,
          transcriptLanguage: transcribed.language,
          transcriptDuration:
            transcribed.duration !== null && transcribed.duration !== undefined
              ? String(transcribed.duration)
              : null,
          error: shortsError,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      // Persist one `shorts` row per Gemini viral moment (new table —
      // all shorts generated from this long video live here).
      const savedShorts =
        viralMoments.moments.length > 0
          ? await db
              .insert(shorts)
              .values(
                viralMoments.moments.map((m) => ({
                  id: `sht_${randomUUID()}`,
                  projectId,
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
              .returning({ id: shorts.id })
          : [];

      // Returned to the Inngest dashboard + run output for testing.
      return {
        projectId,
        status: "ready" as const,
        language: transcribed.language,
        duration: transcribed.duration,
        wordCount: transcribed.wordCount,
        cueCount: transcribed.cueCount,
        transcriptPreview: fullText.slice(0, 500),
        shortsCount: savedShorts.length,
        shortsSelectionError: viralMoments.error,
        shorts: viralMoments.moments.map((m) => ({
          rank: m.rank,
          title: m.title,
          start: m.start,
          end: m.end,
          durationSeconds: m.durationSeconds,
          reason: m.reason,
          seoScore: m.seoScore,
          hook: m.hook ?? null,
          cueCount: m.cueCount,
          transcriptSnippet: m.transcriptSnippet.slice(0, 200),
        })),
      };
    });
  },
);

export const analysisFunctions = [analyzeVideo];
