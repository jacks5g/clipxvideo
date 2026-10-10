import { neon } from "@neondatabase/serverless";

/**
 * Self-healing DDL for the `users` / `projects` / `shorts` tables.
 *
 * Two root causes, one fix:
 * - `[42703] column "transcript_words_json" of relation "projects" does not
 *   exist`: `db/schema.ts` gained new columns (`source_url`, `transcript_*`,
 *   `captions_*`, `inngest_run_id`, ...) but the live Neon DB was never
 *   pushed. Every `db.select().from(projects)` expands to SELECT * including
 *   the new columns, so reads/writes against the stale DB die with 42703.
 * - `[42P01] relation "users" does not exist`: the production (Vercel) Neon
 *   DB is fresh — `npm run db:push` was only ever run against the LOCAL dev
 *   DB, so the live DB has NO tables at all. The very first
 *   `insert into "users"` in POST /api/projects dies with 42P01.
 *
 * This helper is idempotent (`CREATE TABLE IF NOT EXISTS` +
 * `ADD COLUMN IF NOT EXISTS`) and safe to call from API routes on either
 * error — the retried request then succeeds. Prefer running
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
  return isSchemaNotReadyError(err);
}

/** True when an error is Postgres "undefined_table" (fresh DB, no tables). */
export function isMissingTableError(err: unknown): boolean {
  const { codes, texts } = collectCodesAndTexts(err);
  if (codes.has("42P01")) return true;
  return /relation .* does not exist|undefined_table|42P01/i.test(texts);
}

/**
 * True for any "schema not ready" Postgres error the runtime self-healer
 * can fix idempotently via ensureProjectsSchema():
 * - 42703 undefined_column (code added `transcript_*` etc. but Neon not pushed)
 * - 42P01 undefined_table (fresh Vercel/Neon DB — `users`/`projects`/`shorts`
 *   were never created, so the upload dies with
 *   `[42P01] relation "users" does not exist`).
 *
 * Kept as the single predicate all API routes + Inngest functions use, so a
 * missing-table deploy heals the same way a missing-column deploy does.
 */
export function isSchemaNotReadyError(err: unknown): boolean {
  const { codes, texts } = collectCodesAndTexts(err);
  if (codes.has("42703") || codes.has("42P01")) return true;
  return /column .* does not exist|undefined_column|42703|relation .* does not exist|undefined_table|42P01/i.test(
    texts,
  );
}

function collectCodesAndTexts(err: unknown): {
  codes: Set<string>;
  texts: string;
} {
  const codes = new Set<string>();
  const parts: string[] = [];
  // Walk the Drizzle/Neon `cause` chain — the REAL Postgres reason
  // (`code`, `detail`, `message`) is buried 1-2 levels deep while the top
  // message is just "Failed query: insert into ...".
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur && typeof cur === "object"; i++) {
    const rec = cur as Record<string, unknown>;
    if (typeof rec.code === "string") codes.add(rec.code);
    for (const k of ["message", "detail", "hint"] as const) {
      if (typeof rec[k] === "string") parts.push(rec[k] as string);
    }
    const next =
      (rec.cause as unknown) ?? (rec.error as unknown) ?? null;
    if (!next || typeof next !== "object") {
      if (typeof next === "string") parts.push(next);
      break;
    }
    cur = next;
  }
  try {
    parts.push(JSON.stringify(err));
  } catch {
    // ignore — message parts already collected
  }
  return { codes, texts: parts.join("\n") };
}
