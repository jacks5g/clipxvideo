import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects, shorts } from "@/db/schema";
import { ensureProjectsSchema, isMissingColumnError } from "@/lib/ensure-schema";
import { eq, desc, count, inArray } from "drizzle-orm";
import { ajRead, denialKind, isArcjetConfigured } from "@/lib/arcjet";

/** GET /api/projects/list — recent projects for the dashboard, with clip counts. */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Shield + bot protection on the dashboard list endpoint (fail open).
  if (isArcjetConfigured()) {
    try {
      const decision = await ajRead.protect(req);
      if (decision.isDenied()) {
        console.warn(`[projects/list] arcjet denied (${denialKind(decision)}) user=${userId}`);
        return NextResponse.json(
          { error: "Request blocked by security policy" },
          { status: 403 },
        );
      }
    } catch (err) {
      console.warn("[projects/list] arcjet error (fail open):", (err as Error)?.message);
    }
  }
  const db = getDb();
  const query = () =>
    db
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt))
      .limit(20);
  let rows;
  try {
    rows = await query();
  } catch (err) {
    // Stale DB vs code (e.g. transcript_words_json missing): heal + retry.
    if (!isMissingColumnError(err)) throw err;
    console.warn("[projects/list] stale DB schema, self-healing:", (err as Error).message.slice(0, 300));
    await ensureProjectsSchema();
    rows = await query();
  }

  // Attach per-project short counts so the UI can show "N clips" and link
  // straight to the clips. One grouped count query — no N+1.
  let counts: Record<string, number> = {};
  try {
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const grouped = await db
        .select({ projectId: shorts.projectId, n: count() })
        .from(shorts)
        .where(inArray(shorts.projectId, ids))
        .groupBy(shorts.projectId);
      for (const g of grouped) counts[g.projectId] = Number(g.n ?? 0);
    }
  } catch {
    // shorts table missing on very old DBs — counts stay 0, list still works.
    counts = {};
  }

  return NextResponse.json({
    projects: rows.map((r) => ({ ...r, shortsCount: counts[r.id] ?? 0 })),
  });
}
