import { neon } from "@neondatabase/serverless";

/**
 * Self-healing DDL for the `projects` table (plus `users`/`shorts` creation).
 *
 * Root cause of `Upload failed [42703] column "transcript_words_json" of
 * relation "projects" does not exist`:
 *   `db/schema.ts` gained new columns (`source_url`, `transcript_*`,
 *   `captions_*`, `inngest_run_id`, ...) but the live Neon DB was never
 *   pushed (`drizzle-push.log` shows "No changes detected" from an older
 *   schema). Every `db.select().from(projects)` expands to SELECT * including
 *   the new columns, so reads/writes against the stale DB die with 42703.
 *
 * This helper is idempotent (`ADD COLUMN IF NOT EXISTS`) and safe to call
 * from API routes on 42703 — the next request then succeeds. Prefer running
 * `npm run db:push` for the permanent fix; this is the runtime safety net.
 */
export async function ensureProjectsSchema(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const sql = neon(url);

  // Parent tables first (FK targets).
  await sql`
    CREATE TABLE IF NOT EXISTS "users" (
      "id" text PRIMARY KEY,
      "email" text,
      "first_name" text,
      "last_name" text,
      "image_url" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS "projects" (
      "id" text PRIMARY KEY,
      "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "title" text NOT NULL,
      "status" text DEFAULT 'pending' NOT NULL,
      "progress" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `;

  // Every nullable / newer column — added only when missing.
  // Written as explicit tagged-template statements (not a dynamic-string
  // loop) because the @neondatabase/serverless `neon()` client only accepts
  // template literals — `sql.query(dynamicString)` is not available.
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "file_name" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "mime_type" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "size_bytes" bigint`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "storage_key" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "bucket" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "playback_url" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "playback_url_expires_at" timestamp`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "error" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source_url" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source_kind" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_text" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "captions_srt" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "captions_vtt" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_language" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_duration" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "transcript_words_json" text`;
  await sql`ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "inngest_run_id" text`;

  await sql`
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
      "caption_style_json" text,
      "status" text DEFAULT 'ready' NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `;
  // Existing DBs created before caption styling: add the column idempotently.
  await sql`ALTER TABLE "shorts" ADD COLUMN IF NOT EXISTS "caption_style_json" text`;
}

/** True when an error is Postgres "undefined_column" (stale DB vs code). */
export function isMissingColumnError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  const code =
    (err as { code?: string })?.code ??
    (err as { cause?: { code?: string } })?.cause?.code;
  return (
    code === "42703" ||
    /column .* does not exist|undefined_column|42703/i.test(msg)
  );
}
