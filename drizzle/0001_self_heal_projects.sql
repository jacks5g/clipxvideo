-- Self-heal migration for the stale-Neon 42703 crash:
--   [42703] column "transcript_words_json" of relation "projects" does not exist
--
-- `db/schema.ts` gained columns the live DB never received
-- (`drizzle-push.log` shows "No changes detected" from an older schema), so
-- every `db.select().from(projects)` (SELECT * incl. new columns) died.
-- Safe to run repeatedly: tables are IF NOT EXISTS, columns are
-- ADD COLUMN IF NOT EXISTS. Run with psql or `npm run db:push`.
--
-- Permanent fix: `npm run db:push` (drizzle-kit push reads DATABASE_URL from
-- .env.local). Runtime safety net: lib/ensure-schema.ts (same DDL, called on
-- 42703 from the upload routes).

CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY,
  "email" text,
  "first_name" text,
  "last_name" text,
  "image_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "progress" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "file_name" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "mime_type" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "size_bytes" bigint;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "storage_key" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "bucket" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "playback_url" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "playback_url_expires_at" timestamp;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "error" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source_url" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source_kind" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_text" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "captions_srt" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "captions_vtt" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_language" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_duration" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_words_json" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "inngest_run_id" text;

CREATE TABLE IF NOT EXISTS "shorts" (
  "id" text PRIMARY KEY,
  "project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "rank" integer DEFAULT 1 NOT NULL,
  "title" text NOT NULL,
  "start_seconds" real NOT NULL,
  "end_seconds" real NOT NULL,
  "duration_seconds" real,
  "reason" text,
  "hook" text,
  "seo_score" integer,
  "transcript_snippet" text,
  "captions_srt" text,
  "captions_vtt" text,
  "cue_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'ready' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
