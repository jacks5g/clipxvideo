import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ensureProjectsSchema } from "@/lib/ensure-schema";

/**
 * POST /api/admin/repair-schema — one-click manual repair for the stale-Neon
 * 42703 crash (`column "transcript_words_json" of relation "projects" does
 * not exist`). Runs the same idempotent DDL the upload routes run
 * automatically on 42703 (ADD COLUMN IF NOT EXISTS — safe to repeat).
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
