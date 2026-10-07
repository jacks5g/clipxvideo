import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { ensureProjectsSchema, isMissingColumnError } from "@/lib/ensure-schema";
import { eq, and } from "drizzle-orm";
import { createUploadUrl } from "@/lib/storj";
import { ajRead, denialKind, isArcjetConfigured } from "@/lib/arcjet";

/**
 * GET /api/projects/:id/upload-url — fresh presigned PUT URL for the
 * browser to stream bytes straight to Storj. Re-signed per call because
 * presigned URLs expire; also bumps progress so polling shows movement.
 *
 * Shield + bot guard (fail open) — minting PUT URLs is cost-sensitive.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  if (isArcjetConfigured()) {
    try {
      const decision = await ajRead.protect(req);
      if (decision.isDenied()) {
        console.warn(`[upload-url] arcjet denied (${denialKind(decision)}) user=${userId}`);
        return NextResponse.json(
          { error: "Request blocked by security policy" },
          { status: 403 },
        );
      }
    } catch (err) {
      console.warn("[upload-url] arcjet error (fail open):", (err as Error)?.message);
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
    console.warn("[upload-url] stale DB schema, self-healing:", (err as Error).message.slice(0, 300));
    await ensureProjectsSchema();
    rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);
  }
  const project = rows[0];
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.storageKey) {
    // Inngest prepare step hasn't run yet — tell the client to keep polling.
    return NextResponse.json({ error: "Upload not prepared yet", status: project.status }, { status: 409 });
  }

  try {
    const uploadUrl = await createUploadUrl({
      key: project.storageKey,
      contentType: project.mimeType ?? "video/mp4",
    });
    await db
      .update(projects)
      .set({ status: "uploading", progress: 20, updatedAt: new Date() })
      .where(eq(projects.id, id));
    return NextResponse.json({ uploadUrl, storageKey: project.storageKey });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
