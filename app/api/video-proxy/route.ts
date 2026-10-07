import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { projects, shorts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createPlaybackUrl } from "@/lib/storj";

/**
 * GET /api/video-proxy?projectId=...&shortId=...
 * Same-origin Range-aware proxy for clip exports.
 *
 * Why: canvas.captureStream() + MediaRecorder needs same-origin (or CORS-open)
 * video bytes. Storj signed URLs don't send CORS headers, so drawing the
 * <video> straight from Storj taints the canvas and export fails. Proxying
 * through Next (auth-checked, ownership-checked) gives same-origin bytes and
 * forwards Range headers so seeking to clip start is instant.
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? "";
  const shortId = url.searchParams.get("shortId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const db = getDb();
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  const project = rows[0];
  if (!project || !project.storageKey)
    return NextResponse.json({ error: "Video not in storage yet" }, { status: 404 });

  if (shortId) {
    const full = await db.select().from(shorts).where(eq(shorts.id, shortId)).limit(1);
    if (!full[0] || full[0].projectId !== projectId)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fresh signed Storj URL per request (keys rotate every 7 days).
  const upstream = await createPlaybackUrl(project.storageKey, 3600);
  const headers: Record<string, string> = {};
  const range = req.headers.get("range");
  if (range) headers["range"] = range;

  const upstreamRes = await fetch(upstream, { headers });
  if (!upstreamRes.ok && upstreamRes.status !== 206) {
    return NextResponse.json(
      { error: `Storage fetch failed (${upstreamRes.status})` },
      { status: 502 },
    );
  }

  const outHeaders = new Headers();
  const ct = upstreamRes.headers.get("content-type") ?? "video/mp4";
  outHeaders.set("content-type", ct);
  outHeaders.set("accept-ranges", "bytes");
  outHeaders.set("cache-control", "private, max-age=300");
  const cr = upstreamRes.headers.get("content-range");
  if (cr) outHeaders.set("content-range", cr);
  const cl = upstreamRes.headers.get("content-length");
  if (cl) outHeaders.set("content-length", cl);

  return new NextResponse(upstreamRes.body, {
    status: upstreamRes.status,
    headers: outHeaders,
  });
}
