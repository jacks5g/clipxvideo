import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects, shorts } from "@/db/schema";
import { ensureProjectsSchema, isMissingColumnError } from "@/lib/ensure-schema";
import { eq, and, asc } from "drizzle-orm";
import { ajRead, denialKind, isArcjetConfigured } from "@/lib/arcjet";
import { getActualVideoUrl } from "@/lib/storj";

/** GET /api/projects/:id — polled by the UI for status/progress/playbackUrl. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  if (isArcjetConfigured()) {
    try {
      const decision = await ajRead.protect(req);
      if (decision.isDenied()) {
        console.warn(`[projects/:id] arcjet denied (${denialKind(decision)}) user=${userId}`);
        return NextResponse.json(
          { error: "Request blocked by security policy" },
          { status: 403 },
        );
      }
    } catch (err) {
      console.warn("[projects/:id] arcjet error (fail open):", (err as Error)?.message);
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
    // Stale DB (code has columns Neon never got, e.g. transcript_words_json):
    // heal once and retry so polling survives instead of 500ing.
    if (!isMissingColumnError(err)) throw err;
    console.warn("[projects/:id] stale DB schema, self-healing:", (err as Error).message.slice(0, 300));
    await ensureProjectsSchema();
    rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .limit(1);
  }
  let project = rows[0];
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Auto-refresh expired (or missing) signed playback URLs so the player
  // never goes blank after the 7-day expiry. Public buckets (STORJ_PUBLIC_URL)
  // are stable and need no refresh.
  try {
    const expiresAt = project.playbackUrlExpiresAt
      ? new Date(project.playbackUrlExpiresAt).getTime()
      : null;
    const isExpired = !project.playbackUrl || (expiresAt !== null && expiresAt < Date.now() + 60_000);
    if (isExpired && project.storageKey && !process.env.STORJ_PUBLIC_URL) {
      const fresh = await getActualVideoUrl(project.storageKey);
      const updated = await db
        .update(projects)
        .set({
          playbackUrl: fresh,
          playbackUrlExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      if (updated[0]) project = updated[0];
    } else if (isExpired && project.storageKey && process.env.STORJ_PUBLIC_URL) {
      const fresh = await getActualVideoUrl(project.storageKey);
      const updated = await db
        .update(projects)
        .set({ playbackUrl: fresh, playbackUrlExpiresAt: null, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      if (updated[0]) project = updated[0];
    }
  } catch (refreshErr) {
    console.warn("[projects/:id] playback refresh failed (serving stale):", (refreshErr as Error)?.message?.slice(0, 300));
  }

  const shortRows = await db
    .select()
    .from(shorts)
    .where(eq(shorts.projectId, id))
    .orderBy(asc(shorts.rank))
    .catch(async (err) => {
      if (!isMissingColumnError(err)) throw err;
      console.warn("[projects/:id] stale shorts schema, self-healing:", (err as Error).message.slice(0, 300));
      await ensureProjectsSchema();
      return db
        .select()
        .from(shorts)
        .where(eq(shorts.projectId, id))
        .orderBy(asc(shorts.rank));
    });
  return NextResponse.json({ project, shorts: shortRows });
}

/**
 * PATCH /api/projects/:id — legacy link-import finalize.
 * Link tabs are now DOWNLOADED server-side (upload fn streams the watch page
 * via Cobalt into Storj), so this is a no-op safety net: if bytes already
 * landed (storageKey set) report ready; otherwise tell the client to keep
 * polling while the download runs.
 */
export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .limit(1);
  const project = rows[0];
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!project.sourceUrl) {
    return NextResponse.json(
      { error: "PATCH finalize is only for link imports — file uploads use POST /complete" },
      { status: 400 }
    );
  }

  const updated = await db
    .update(projects)
    .set({
      // Never clobber a finished Storj upload back to a link stub: if the
      // download already landed (storageKey set), keep status/progress and
      // just ensure playbackUrl exists.
      ...(project.storageKey
        ? { playbackUrl: project.playbackUrl ?? project.sourceUrl, error: null, updatedAt: new Date() }
        : { status: "uploading", progress: 25, playbackUrl: null, error: null, updatedAt: new Date() }),
    })
    .where(eq(projects.id, id))
    .returning();
  return NextResponse.json({ project: updated[0] });
}
