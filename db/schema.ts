import { pgTable, text, timestamp, bigint, integer, real } from "drizzle-orm/pg-core";

/**
 * Mirrors the Clerk user into Neon so the app owns a local copy.
 * Synced lazily on every visit (see lib/sync-user.ts) — no webhooks.
 */
export const users = pgTable("users", {
  // Clerk user ID, e.g. "user_2abc..." — stable primary key.
  id: text("id").primaryKey(),
  email: text("email"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/**
 * One row per video the user uploads. Created BEFORE the bytes hit
 * Storj so the UI has a projectId to poll immediately.
 *
 * Status lifecycle (polled by the client):
 *   pending -> requesting_upload -> uploading -> uploaded -> processing -> ready
 *   any state -> failed (error holds the message)
 */
export const projects = pgTable("projects", {
  // e.g. "prj_..." — generated in the API route via crypto.randomUUID().
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // Original filename from the user's device, or link label for URL imports.
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  // Storj S3 object key, e.g. "user_xxx/prj_yyy/original.mp4"
  storageKey: text("storage_key"),
  bucket: text("bucket"),
  // Long-lived signed URL for viewing the uploaded video.
  playbackUrl: text("playback_url"),
  playbackUrlExpiresAt: timestamp("playback_url_expires_at"),
  status: text("status").notNull().default("pending"),
  // 0-100 — written by API routes + the Inngest function, read by polling.
  progress: integer("progress").notNull().default(0),
  error: text("error"),
  // Optional YouTube/Twitch source link.
  sourceUrl: text("source_url"),
  sourceKind: text("source_kind"),
  // AI analysis — Deepgram transcription + captions.
  // Written by the `analyze-video-transcribe` Inngest function
  // (event `video/analysis.requested`), polled by
  // `/dashboard/projects/:id` for the step-by-step progress UI.
  transcriptText: text("transcript_text"),
  captionsSrt: text("captions_srt"),
  captionsVtt: text("captions_vtt"),
  transcriptLanguage: text("transcript_language"),
  transcriptDuration: text("transcript_duration"),
  // Compact word timings JSON (Deepgram words) — written by
  // `transcribe-video`, read by `select-viral-moments` to slice
  // per-short captions. Kept out of Inngest step outputs.
  transcriptWordsJson: text("transcript_words_json"),
  // Inngest run id for debugging in the Inngest dashboard.
  inngestRunId: text("inngest_run_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;

/**
 * One row per AI-generated short cut from a long video.
 * Written by the `select-viral-moments` + `save-shorts` Inngest steps
 * (event `video/analysis.requested`), right after transcription.
 * Each short keeps its own start/end, why-it-works reason, SEO score,
 * transcript snippet + sliced SRT/VTT captions for that range.
 */
export const shorts = pgTable("shorts", {
  // e.g. "sht_..." — generated in the Inngest fn via crypto.randomUUID().
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // 1-based rank (1 = best moment).
  rank: integer("rank").notNull().default(1),
  title: text("title").notNull(),
  // Seconds into the source video (1-decimal precision).
  startSeconds: real("start_seconds").notNull(),
  endSeconds: real("end_seconds").notNull(),
  durationSeconds: real("duration_seconds"),
  // Why this is the best short (hook, payoff, retention).
  reason: text("reason"),
  hook: text("hook"),
  // SEO / virality score 0-100 from Gemini.
  seoScore: integer("seo_score"),
  // Transcript slice + per-short captions for [start, end].
  transcriptSnippet: text("transcript_snippet"),
  captionsSrt: text("captions_srt"),
  captionsVtt: text("captions_vtt"),
  cueCount: integer("cue_count").notNull().default(0),
  // Caption design for this short — one CaptionStyle JSON blob
  // (see lib/caption-styles.ts, the single source of truth).
  captionStyleJson: text("caption_style_json"),
  status: text("status").notNull().default("ready"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ShortRow = typeof shorts.$inferSelect;
export type NewShortRow = typeof shorts.$inferInsert;

