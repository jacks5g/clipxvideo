import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ensureProjectsSchema, isMissingColumnError } from "@/lib/ensure-schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { getActualVideoUrl, headObject } from "@/lib/storj";
import { ajRead, denialKind, isArcjetConfigured } from "@/lib/arcjet";

/**
 * POST /api/projects/:id/complete — called by the browser after its PUT to
 * Storj finishes. Fires `video/upload.finalize` so the Inngest
 * `finalize-storj-upload` step verifies the object + mints the signed
 * playback URL; falls back to finalizing inline when Inngest is unreachable.
 *
 * Shield + bot guard (fail open) — finalize flips rows to ready.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  if (isArcjetConfigured()) {
    try {
      const decision = await ajRead.protect(req);
      if (decision.isDenied()) {
        console.warn(`[complete] arcjet denied (${denialKind(decision)}) user=${userId}`);
        return NextResponse.json(
          { error: "Request blocked by security policy" },
          { status: 403 },
        );
      }
    } catch (err) {
      console.warn("[complete] arcjet error (fail open):", (err as Error)?.message);
    }
  }

  const db = getDb();
  let rows;
  try {
    rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);
  } catch (err) {
    // Stale DB vs code (e.g. transcript_words_json missing): heal + retry.
    if (!isMissingColumnError(err)) throw err;
    console.warn("[complete] stale DB schema, self-healing:", (err as Error).message.slice(0, 300));
    await ensureProjectsSchema();
    rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);
  }
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db
    .update(projects)
    .set({ status: "processing", progress: 85, updatedAt: new Date() })
    .where(eq(projects.id, id));

  try {
    await inngest.send({ name: "video/upload.finalize", data: { projectId: id } });
    return NextResponse.json({ ok: true, via: "inngest" });
  } catch (sendErr) {
    console.warn("[complete] inngest.send failed, finalizing inline:", (sendErr as Error).message);
    try {
      const project = rows[0];
      if (!project.storageKey) throw new Error("No storageKey — upload never prepared");
      const head = await headObject(project.storageKey);
      const playbackUrl = await getActualVideoUrl(project.storageKey);
      await db
        .update(projects)
        .set({
          status: "ready",
          progress: 100,
          playbackUrl,
          playbackUrlExpiresAt: process.env.STORJ_PUBLIC_URL
            ? null
            : new Date(Date.now() + 7 * 24 * 3600 * 1000),
          sizeBytes: head.size ?? project.sizeBytes,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
      return NextResponse.json({ ok: true, via: "inline" });
    } catch (err) {
      await db
        .update(projects)
        .set({ status: "failed", error: (err as Error).message, updatedAt: new Date() })
        .where(eq(projects.id, id));
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  }
}
