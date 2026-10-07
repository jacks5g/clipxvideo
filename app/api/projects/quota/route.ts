import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { and, eq, gte, count, asc } from "drizzle-orm";
import {
  DAILY_UPLOAD_LIMIT,
  msUntilReset,
  remainingUploads,
  windowStart,
} from "@/lib/upload-quota";

/**
 * GET /api/projects/quota — today's upload usage for the signed-in user.
 * Used by the dashboard to show "X / 17 uploads today" + reset timer.
 * Response: { limit, used, remaining, resetsInSeconds }
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const db = getDb();
    const since = windowStart();
    const cnt = await db
      .select({ n: count() })
      .from(projects)
      .where(and(eq(projects.userId, userId), gte(projects.createdAt, since)));
    const used = Number(cnt[0]?.n ?? 0);
    let resetsInSeconds = 0;
    if (used > 0) {
      const oldestRows = await db
        .select({ createdAt: projects.createdAt })
        .from(projects)
        .where(and(eq(projects.userId, userId), gte(projects.createdAt, since)))
        .orderBy(asc(projects.createdAt))
        .limit(1);
      resetsInSeconds = Math.max(
        0,
        Math.ceil(msUntilReset(oldestRows[0]?.createdAt ?? null) / 1000),
      );
    }
    return NextResponse.json({
      limit: DAILY_UPLOAD_LIMIT,
      used,
      remaining: remainingUploads(used),
      resetsInSeconds,
    });
  } catch (err) {
    console.warn("[quota] check failed:", (err as Error)?.message?.slice(0, 300));
    return NextResponse.json({
      limit: DAILY_UPLOAD_LIMIT,
      used: 0,
      remaining: DAILY_UPLOAD_LIMIT,
      resetsInSeconds: 0,
    });
  }
}
