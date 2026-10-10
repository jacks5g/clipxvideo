import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureProjectsSchema } from "@/lib/ensure-schema";

/**
 * POST /api/admin/repair-schema — one-click manual repair for the stale-Neon
 * 42703 crash (`column "transcript_words_json" of relation "projects" does
 * not exist`) AND the fresh-DB 42P01 crash (`relation "users" does not
 * exist` on Vercel deploys whose DATABASE_URL was never migrated).
 * Runs the same idempotent DDL the upload routes run automatically on
 * either error (CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS —
 * safe to repeat).
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await ensureProjectsSchema();
    return NextResponse.json({ ok: true, repaired: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
